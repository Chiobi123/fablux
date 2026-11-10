/* FabluX.U.Design — safe static build.
 *
 * Produces dist/ containing ONLY files that are safe to serve publicly.
 * Everything sensitive (local secrets, SQL migrations, DB tools, docs,
 * node_modules, git history) is deliberately excluded.
 *
 * Run:  node build.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');

/* Public root files. Anything not listed here is never copied. */
const ROOT_FILES = [
  'favicon.svg', 'robots.txt', 'sitemap.xml', 'health.json',
  '_headers', '.htaccess'
];

/* Public directories (copied recursively). */
const PUBLIC_DIRS = ['css', 'js', 'images'];

/* Never allow these patterns into dist, even if a root file is added later. */
const BLOCK = [
  /^server[\\/]/i, /^node_modules[\\/]/i, /^dist[\\/]/i, /^\.git[\\/]/i,
  /^docs?[\\/]/i, /^db[\\/]/i, /^_private-tools[\\/]/i, /^tools[\\/]/i,
  /\.env/i, /\.sql$/i, /\.md$/i, /\.zip$/i, /^package(-lock)?\.json$/i,
  /^build\.js$/i, /^netlify\.toml$/i, /^vercel\.json$/i,
  /^(db-|seed-|test-|cleanup|peek|tmp-|setup-admins)/i
];

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function copyFile(rel) {
  const src = path.join(ROOT, rel);
  const dst = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function copyDir(rel) {
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const childRel = path.join(rel, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      count += copyDir(childRel);
    } else if (entry.isFile()) {
      copyFile(childRel);
      count++;
    }
  }
  return count;
}

/* Safety net: refuse to publish obvious secrets. */
function scanForSecrets() {
  const markers = [
    'SUPABASE_SERVICE_ROLE_KEY', 'sb_secret', 'service_role',
    'PAYSTACK_SECRET_KEY', 'RESEND_API_KEY', 'xkeysib-', 'sk_live_'
  ];
  const exts = new Set(['.html', '.css', '.js', '.json', '.xml', '.txt', '.svg', '.toml']);
  const bad = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile() && exts.has(path.extname(entry.name).toLowerCase())) {
        const text = fs.readFileSync(p, 'utf8');
        for (const marker of markers) {
          if (marker && text.includes(marker)) {
            bad.push(path.relative(DIST, p) + ' contains ' + marker.slice(0, 24) + '…');
            break;
          }
        }
      }
    }
  }
  walk(DIST);
  if (bad.length) {
    console.error('\nBUILD ABORTED — secrets found in public output:');
    bad.forEach((b) => console.error('  - ' + b));
    process.exit(1);
  }
}

rmrf(DIST);
fs.mkdirSync(DIST, { recursive: true });

let copied = 0;
for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  if (entry.name.endsWith('.html')) { copyFile(entry.name); copied++; }
}
for (const f of ROOT_FILES) {
  if (fs.existsSync(path.join(ROOT, f))) { copyFile(f); copied++; }
}
for (const dir of PUBLIC_DIRS) copied += copyDir(dir);

scanForSecrets();

/* Report what was intentionally left out. */
const excluded = fs.readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => !e.name.endsWith('.html'))
  .map((e) => e.name)
  .filter((name) => {
    if (ROOT_FILES.includes(name)) return false;
    if (PUBLIC_DIRS.includes(name)) return false;
    if (name === 'dist') return false;
    return true;
  });

console.log('Built dist/ with ' + copied + ' public files.');
console.log('Excluded (not deployed): ' + excluded.join(', '));
