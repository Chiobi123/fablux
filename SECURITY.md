# FabluX.U.Design — Security Guide

This project is a **static frontend that talks directly to Supabase**. There is no
application server holding sessions. That means **all** data protection must come
from PostgreSQL Row Level Security (RLS) plus host-level headers — and the only
key that may ever ship to the browser is the Supabase **publishable/anon** key.

---

## 1. Architecture and trust boundaries

```
Browser ──HTTPS──> CDN / static host ──> HTML/CSS/JS
        └────────> Supabase Auth (JWT)
        └────────> Supabase PostgREST / RPC  ──> PostgreSQL + RLS
        └────────> Supabase Storage (public bucket, admin-only writes)
```

* The browser is untrusted. Every privileged action must be enforced in the database.
* The service-role key **must never** be in `js/`, HTML, or any file served by the CDN.
* Orders and payments are written only through `SECURITY DEFINER` functions
  (`create_order`, `admin_*`), never by direct table inserts.

---

## 2. What is implemented in this repo

| Control | Where |
|---|---|
| RLS enabled on every table | `setup-security-hardening.sql` |
| Customers can only read their own users/orders/items/payments/returns/addresses | `setup-rls.sql` + `setup-security-hardening.sql` |
| Admin-only writes through `is_admin()` / `assert_admin()` | `setup-rls.sql`, `setup-fulfilment.sql` |
| Sensitive tables revoked from `anon` | `setup-security-hardening.sql` |
| `settings` limited to a public whitelist | `setup-security-hardening.sql` |
| Contact/newsletter writes only via rate-limited RPCs | `setup-security-hardening.sql` |
| Honeypot + per-email rate limit (5/hour contact, 3/hour newsletter) | `setup-security-hardening.sql` |
| Uploads: 5 MB, jpeg/png/webp/gif only, admin-only writes | `setup-product-images.sql` + hardening |
| Customer self-service data deletion | `delete_my_data()` |
| Consent recorded for contact/newsletter | `consent_at` columns |
| Google sign-in via Supabase OAuth | `js/api-client.js` (`loginWithGoogle`) |
| CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy | `_headers`, `vercel.json`, `nginx.conf.example`, `.htaccess` |
| HTTPS redirect | nginx / `.htaccess` / host platform |
| Only public files deployed | `build.js` → `dist/` |
| Secret scan before deploy | `build.js` aborts if secrets reach `dist/` |
| Cookie consent gates analytics | `js/consent.js` |
| Client error log (last 20, no PII) | `js/error-log.js` |
| XSS-safe output | `esc()` in `backend-bridge.js`/`admin.js`; no `innerHTML` with raw user input |
| SQL injection | PostgREST + parameterised RPC calls only; no string-built SQL in the client |

---

## 3. Supabase dashboard settings you must complete

These cannot be set from the repository. Do them in the Supabase dashboard:

1. **Spend cap** — Project Settings → Billing → set a monthly spend cap.
2. **CORS** — Project Settings → API → allowed origins: only your production
   domain(s), e.g. `https://fablux.pages.dev`. Do not leave `*` if avoidable.
3. **Rate limits** — Authentication → Rate Limits: keep email sign-in/sign-up
   limits enabled. The database also rate-limits public forms.
4. **Leaked password protection** — Authentication → Providers → enable
   "Prevent leaked passwords" (HaveIBeenPwned check).
5. **Email confirmation** — keep "Confirm email" ON so disposable addresses
   cannot create usable accounts.
6. **Google provider** — Authentication → Providers → Google: add your OAuth
   client ID/secret, and add `https://fablux.pages.dev/account.html` (and your
   preview domains) to the redirect allow-list.
7. **JWT expiry** — Authentication → Sessions: short access-token lifetime
   (e.g. 1 hour) with refresh tokens enabled.
8. **Database network** — restrict direct Postgres connections to trusted IPs;
   the browser never needs a direct DB connection.
9. **Storage** — keep the `product-images` bucket public for reads (product
   photos) and confirm the write policies from `setup-product-images.sql`.
10. **Backups** — enable Point-in-Time Recovery if your plan includes it.

---

## 4. Deploying safely (read this before every launch)

The repository root contains **server-side material**: SQL migrations and
local-only helper scripts. Secrets (service-role key, database password) live
outside the web root in `_private-tools/.env`, which is never deployed.
**Never upload or publish the repository root.**

```bash
node build.js        # creates dist/ with public files only
# deploy dist/ — not ./
```

`build.js` refuses to finish if it finds a secret in the output.

Supported platforms:

| Platform | Setup |
|---|---|
| Netlify | `netlify.toml` already sets `node build.js` + `publish = dist` |
| Vercel | `vercel.json` already sets the build command + `dist` |
| Cloudflare Pages | build command `node build.js`, output directory `dist` |
| nginx/Apache | copy `dist/` to the web root; use `nginx.conf.example` or `.htaccess` |

---

## 5. Rotate these credentials if the folder was ever shared or uploaded

Because the database password was historically hardcoded in local helper
scripts, treat it as exposed if you ever:

* uploaded the repository root to a host,
* shared the folder or a zip of it,
* committed those scripts (they are gitignored, but check history anyway).

If so:

1. Supabase → Project Settings → Database → **Reset database password**. Update
   `SUPABASE_DB_PASSWORD` in `_private-tools/.env`.
2. Supabase → Project Settings → API → **roll the service-role key** if it was
   ever exposed. Update `_private-tools/.env`.
3. Rotate `ADMIN_PASSWORD`, Paystack and Resend keys.
4. Sign out all sessions (Authentication → Sessions).

The publishable/anon key is designed to be public **only because RLS protects
the data**. If RLS were ever disabled, that key would expose everything.

---

## 6. Payments

* Never store card numbers, CVV or full PAN. Card payments must be hosted by a
  PCI-compliant provider (Paystack/Stripe).
* The current checkout supports **pay on delivery** and **bank transfer**.
  Do not enable a card option in the UI until the provider integration is live
  and tested in the provider's test mode.

---

## 7. If something goes wrong

1. In Supabase, disable the affected API key / rotate the service role.
2. `ALTER TABLE ... FORCE ROW LEVEL SECURITY` is already the default posture via
   RLS; verify with:
   ```sql
   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public';
   ```
3. Check `audit_log` for admin actions and `fablux_error_log_v1` in the affected
   browser for client errors.
4. Preserve logs before rolling back; take a database backup first.
