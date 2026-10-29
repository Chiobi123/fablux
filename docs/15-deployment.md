# 15 — Deployment, Environment and Production Readiness

**Status:** deployable; external accounts outstanding · last reviewed 2026-10-29
Companions: `../PRODUCTION_LAUNCH_CHECKLIST.md`, `../BACKEND_SETUP.md`.

---

## 1. Environments

| Environment | URL | Data | Purpose |
|---|---|---|---|
| Local | `http://127.0.0.1:8086` (`python -m http.server --directory fab7`) | **same** Supabase project | development |
| Production | `https://fablux.pages.dev` (Cloudflare Pages) | same project | live |

There is **no staging project**. Schema work is applied to the same database used in
production; take a backup first (`16-operations.md` §2). This is TD-10.

## 2. Build

```bash
node build.js
```

- Input: repository root (`fab7/`).
- Output: `dist/` (gitignored).
- Excludes: `.sql`, `.env`, `_private-tools`, `docs`, `loadtest`, `node_modules`,
  `dist`, dotfiles, `build.js` itself if matched.
- Current output: 67 files.
- Verifies nothing else; it is a copy with a block list.

**Asset versioning:** change every `?v=…` token in HTML when a CSS/JS file changes.
Current token: `20261029l`. A stale token is the most common "my fix isn't live" cause.

## 3. Environment variables and configuration

### 3.1 Browser (public, by design)

Hard-coded in `js/api-client.js`:

```
BASE = https://msisbmcowtggbvasubla.supabase.co
KEY  = sb_publishable_E0_BuUK9piwZfNdvlwpbAA_-CM03cNs   (publishable/anon)
```

These are not secrets. The publishable key can be rotated in Supabase → Settings →
API; update `api-client.js`, bump the asset token, redeploy.

### 3.2 Private tooling (`_private-tools/.env`, never committed)

| Variable | Used by | Purpose |
|---|---|---|
| `SUPABASE_URL` | db.js | project URL |
| `SUPABASE_ANON_KEY` | db.js | optional REST checks |
| `SUPABASE_SERVICE_ROLE_KEY` | db.js | admin operations (rotate if leaked) |
| `SUPABASE_DB_HOST` / `PORT` / `USER` / `PASSWORD` | db.js | `psql`/`pg` access for `apply` and `query` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | none | empty placeholders from the retired Node server — do not use |

### 3.3 Platform configuration (Supabase dashboard)

| Setting | Required value |
|---|---|
| Site URL | `https://fablux.pages.dev` |
| Additional redirect URLs | `/account.html`, `/login.html`, `/reset-password.html`, `/forgot-password.html` |
| Email provider | Supabase default (rate-limited); configure SMTP for production volume |
| Auth flow | implicit (the client uses raw `/authorize`) |
| Google provider | **disabled** — steps in `09-auth.md` §6 |
| Storage bucket | `product-images`, public read, admin write |

### 3.4 Host configuration

`_headers` is read by Cloudflare Pages and Netlify. It sets CSP, HSTS, nosniff,
frame denial, referrer and permissions policy, plus cache rules. Nginx users should
port the same header block from `nginx.conf.example`; `vercel.json` covers Vercel.

## 4. Deploy procedure

1. `node build.js`
2. Confirm the output: 67 files, `dist/_headers` present, no `.sql`/`.env`.
3. Commit and push `main`:
   ```bash
   git add -A && git commit -m "…" && git push origin main
   ```
4. Cloudflare Pages builds (command `node build.js`, output `dist`) if the project is
   connected to the repo; otherwise upload `dist/` with `wrangler pages deploy dist`.
5. Wait for the deployment to report success.
6. Smoke test (below).

### 4.1 Smoke test after every deploy

| # | Check |
|---|---|
| 1 | `/` loads, hero visible, no console errors |
| 2 | Response headers include `content-security-policy` and `strict-transport-security` |
| 3 | `/shop.html` shows products from the database |
| 4 | `/login.html` — Google button shows the "not enabled" notice (until OAuth is enabled) |
| 5 | Theme toggle works and persists |
| 6 | Language switch translates without an English flash |
| 7 | `/admin.html` redirects a signed-out visitor |
| 8 | `/health.json` returns JSON |

### 4.2 Rollback

Cloudflare Pages keeps previous deployments: *Deployments → … → Rollback*. Database
changes are not rolled back by that action; use `16-operations.md` §2.

## 5. Release process

1. Implement + verify locally.
2. Update `docs/` in the same commit (`README.md` rule).
3. Add an entry to `19-support-and-releases.md` §4.
4. Bump the asset token if CSS/JS changed.
5. `node build.js`, commit, push, deploy, smoke test.

## 6. Production readiness checklist

### 6.1 Met

- [x] No secret keys in shipped files.
- [x] RLS on all 18 tables; admin RPCs assert the role.
- [x] Prices/stock computed server-side.
- [x] CSP, HSTS, nosniff, frame denial, referrer policy.
- [x] Policies pages published (privacy, terms, cookies, returns, refunds).
- [x] Consent banner; no analytics before consent.
- [x] Error handling with human messages.
- [x] Responsive to 360 px; light/dark themes verified.
- [x] Build excludes SQL, env, docs, tooling.
- [x] Backup and restore procedure documented.
- [x] Documentation set (this folder).

### 6.2 Outstanding (owner action)

- [ ] Store contact details in `settings` (`store_contact`, `store_email`,
      `store_address`) — currently empty.
- [ ] Product photography uploaded to `product-images`; `logo.jpg` is 0 bytes.
- [ ] Google OAuth enabled (`09-auth.md` §6) or decision to ship email-only.
- [ ] Email provider connected, or accepted that alerts live only in the outbox.
- [ ] Supabase redirect URLs allow-listed for the production domain.
- [ ] Backup taken and restore rehearsed on a scratch project.
- [ ] UAT script in `13-testing-qa.md` §5 executed and signed.
- [ ] Lighthouse + axe run recorded in `14-performance.md` §5.
- [ ] Admin account re-created after the 2026-10-29 wipe.

### 6.3 Launch gate

Do not take paid orders until §6.2 has no unchecked item that affects money
(contact details, photography, UAT, backup). Google OAuth and email are quality
items, not blockers for a pay-on-delivery launch.
