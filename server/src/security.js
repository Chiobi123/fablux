const crypto = require('node:crypto');

const PASSWORD_ITERATIONS = 210000;
const PASSWORD_KEYLEN = 32;
const PASSWORD_DIGEST = 'sha256';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEYLEN, PASSWORD_DIGEST).toString('hex');
  return `pbkdf2$${PASSWORD_ITERATIONS}$${salt}$${derived}`;
}
function verifyPassword(password, stored) {
  const [scheme, iterations, salt, expected] = String(stored).split('$');
  if (scheme !== 'pbkdf2' || !iterations || !salt || !expected) return false;
  const actual = crypto.pbkdf2Sync(password, salt, Number(iterations), PASSWORD_KEYLEN, PASSWORD_DIGEST).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}
function randomId(prefix='id') { return `${prefix}_${crypto.randomBytes(12).toString('hex')}`; }
function token() { return crypto.randomBytes(32).toString('base64url'); }
function tokenHash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function timingSafeEqualText(a,b){ const aa=Buffer.from(String(a)); const bb=Buffer.from(String(b)); return aa.length===bb.length && crypto.timingSafeEqual(aa,bb); }
module.exports = { hashPassword, verifyPassword, randomId, token, tokenHash, timingSafeEqualText };
