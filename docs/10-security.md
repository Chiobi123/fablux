# 10 — Security Requirements, Controls and Audit

**Status:** current · last reviewed 2026-10-29
Companion: `../SECURITY.md` (owner-facing), `07-database.md` (RLS), `09-auth.md`.

---

## 1. Threat model (short)

Assets: customer personal data (name, phone, address, email), order records, the
catalogue and prices, the admin role.

Likely attackers: opportunistic scanners, someone who knows the admin email,
a customer tampering with the client to change a price or read another order.

Out of scope: nation-state actors, physical access to the owner's devices,
compromise of Supabase or Cloudflare themselves.

| # | Threat | Control | Verified |
|---|---|---|---|
| T1 | Price tampering in the cart | `create_order` ignores client prices | yes — SQL review |
| T2 | Reading another customer's order | RLS `user_id = auth.uid()`; tracking needs a 48-hex token | yes |
| T3 | Self-granting admin | trigger assigns role from email allow-list; `is_admin()` server-side | yes |
| T4 | XSS through product/review text | every dynamic string passes `esc()` before `innerHTML`; CSP | yes — commit `d456bea` |
| T5 | Stored XSS via admin fields | same escaping on admin-rendered rows | yes |
| T6 | Form spam / abuse | `rate_limit_hit`, honeypot, consent flag | yes |
| T7 | Secret leakage | only the publishable key ships; build excludes `.env`, SQL, tools | yes — `node build.js` |
| T8 | Clickjacking | `frame-ancestors 'none'`, `X-Frame-Options: DENY` | config |
| T9 | Protocol downgrade | HSTS 2 years + `upgrade-insecure-requests` | config |
| T10 | Third-party script abuse | CSP script allow-list; Google Translate loaded only on demand | config |
| T11 | Token theft via XSS | JWT in `localStorage` (trade-off); 1 h expiry; CSP reduces XSS risk | accepted |
| T12 | Enumeration of accounts | Supabase generic auth errors | yes |
| T13 | Brute force | Supabase Auth rate limits | platform |
| T14 | Data retention beyond need | `delete_my_data`; retention rules in `07-database.md` §7 | yes |

## 2. Security requirements

| ID | Requirement | Status |
|---|---|---|
| SR-1 | RLS enabled on every table holding user data | Met |
| SR-2 | No service-role key in any shipped file | Met |
| SR-3 | All user input validated server-side (length, type, range) | Met in RPCs |
| SR-4 | All output escaped before `innerHTML` | Met (`esc()`) |
| SR-5 | CSP without `unsafe-eval`; `object-src 'none'` | Met |
| SR-6 | HSTS, nosniff, referrer policy, permissions policy | Met |
| SR-7 | Passwords handled only by Supabase Auth (never stored by us) | Met |
| SR-8 | Admin actions audited | Met (`audit_log`) |
| SR-9 | Rate limits on public writes | Met |
| SR-10 | Consent before non-essential scripts | Met (`consent.js`) |
| SR-11 | Dependency minimisation (no npm runtime deps) | Met |
| SR-12 | MFA for admin accounts | **Not met** — enable in Supabase when available on plan |

## 3. Implemented controls

### 3.1 Transport and headers (`_headers`)

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=()
Cross-Origin-Opener-Policy: same-origin
Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none';
  frame-ancestors 'none'; form-action 'self';
  script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com
             https://translate.google.com https://translate.googleapis.com
             https://translate-pa.googleapis.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com
            https://cdnjs.cloudflare.com https://translate.googleapis.com
            https://www.gstatic.com;
  font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com
           https://translate.googleapis.com;
  img-src 'self' data: https:;
  connect-src 'self' https://msisbmcowtggbvasubla.supabase.co
              https://translate.googleapis.com https://translate-pa.googleapis.com;
  frame-src https://translate.google.com;
  upgrade-insecure-requests
```

`'unsafe-inline'` remains for (a) the small theme/language bootstrap script in
`<head>` and (b) inline `style` attributes used by the renderers. Removing it is a
future hardening step that requires extracting those styles and using a nonce
(TD-03). The CSP is only enforced by the host (Cloudflare/Netlify), not by the local
Python preview server.

### 3.2 Application

- `esc()` applied to every interpolated value in `backend-bridge.js`, `admin.js`,
  `product.js`, `pro.js`.
- `friendly()` prevents raw errors/stack traces reaching the UI.
- `error-log.js` keeps a bounded in-memory ring buffer; nothing is sent anywhere.
- `consent.js` gates non-essential scripts until consent is given.
- Password inputs never copy to the DOM elsewhere; the eye toggle only flips `type`.
- Uploads: admin-only, MIME/size checked in `adminUploadImage`.

### 3.3 Database

- Every table: `ALTER TABLE … ENABLE ROW LEVEL SECURITY`.
- `SECURITY DEFINER` functions pin `search_path = public, pg_temp`.
- `create_order` is the only write path for orders; clients cannot insert directly.
- Unique constraints on `orders.reference`, `orders.tracking_token`,
  `orders.idempotency_key`, `payment_transactions.reference`.
- `CHECK` constraints on money and stock (`price >= 0`, `stock >= 0`,
  `quantity > 0`, `rating between 1 and 5`).
- Audit rows written by admin RPCs, not by the client.

## 4. Secrets

| Secret | Where | Ships to browser? |
|---|---|---|
| Supabase URL + publishable key | `js/api-client.js` | yes, by design |
| Supabase service-role key | `_private-tools/.env` | never |
| DB password / host | `_private-tools/.env` | never |
| Google OAuth client secret | Supabase dashboard | never (not in repo) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | `_private-tools/.env`, empty | never, unused |

`.gitignore` excludes `.env`, `_private-tools/`, `dist/`, `node_modules/`.
`build.js` additionally refuses to copy `.sql`, `.env`, docs, `_private-tools`,
`loadtest`.

Rotating the publishable key requires editing `js/api-client.js`, bumping the asset
version, and redeploying. Rotating the DB password affects only `_private-tools`.

## 5. Audit results (2026-10-29)

| Check | Result |
|---|---|
| Stored XSS via reviews/contacts/admin rows | Fixed in `d456bea`; all renderers escape |
| Price authority | Confirmed: `create_order` re-reads `products` |
| RLS coverage | 18/18 tables have RLS enabled |
| Admin gating | `assert_admin()` in every admin RPC |
| Service key in dist | None (build excludes + grep) |
| 18+ gate | Removed (not part of the business) |
| Unused Express server | Removed |
| Fake reviews | None seeded; `reviews` is empty after the wipe |
| Secret scan | Only the publishable key present |
| CSP | Present in `_headers`; not enforced locally |
| Dependency CVEs | No runtime dependencies (see `12-development.md` §7) |

**Open findings**

| ID | Finding | Severity | Action |
|---|---|---|---|
| F1 | `'unsafe-inline'` in `script-src` | Medium | extract inline bootstrap, add nonce/hash (TD-03) |
| F2 | JWT in `localStorage` | Medium | accepted for a static SPA; mitigate with CSP + short expiry; move to cookies only with a server |
| F3 | No admin MFA | Medium | enable Supabase MFA when the plan allows |
| F4 | Google OAuth provider disabled | Low (feature, not vuln) | enable per `09-auth.md` §6 |
| F5 | `public.users.password_hash` legacy column | Low | drop after confirming nothing reads it (TD-01) |
| F6 | `auth.users` rows survive `delete_my_data` | Low | service-role deletion job (TD-05) |
| F7 | No automated security regression tests | Medium | see `13-testing-qa.md` §9 |

## 6. Data protection (NDPA / GDPR-aligned)

Nigeria's Data Protection Act 2023 is the primary regime; GDPR principles are used
as the design benchmark because the shop can receive EU visitors.

| Principle | Implementation |
|---|---|
| Lawful basis | contract (orders), consent (newsletter, non-essential scripts) |
| Data minimisation | only name, email, phone, address, order data; no birth date, no ID |
| Purpose limitation | marketing only with explicit newsletter consent |
| Storage limitation | account deletion removes profile data; orders retained for accounting |
| Accuracy | customers edit their own names/addresses |
| Integrity | TLS, RLS, no client-side secrets |
| Accountability | `audit_log`, this document, `21-legal.md` |
| Subject rights | access (account page), erasure (`delete_my_data`), portability (manual export on request), objection (unsubscribe) |

**Gaps:** no Data Processing Agreement on file with Supabase/Cloudflare (their
standard terms apply), no registered DPO (not required at this scale), no formal
records-of-processing register beyond this document. Cross-border transfer relies on
the providers' standard contractual clauses.

Data locations: Supabase region (project default) for database/auth/storage;
Cloudflare edge for static assets; Google receives page text only when a visitor
chooses a non-English language.

## 7. Incident classification

| Level | Example | Response |
|---|---|---|
| P1 | admin account compromised, data leak | rotate publishable key, force sign-out, review `audit_log`, notify affected users |
| P2 | XSS/HTML injection found | patch renderer, redeploy, review logs |
| P3 | spam wave, rate-limit bypass | tighten limits, block subject |
| P4 | dependency/header finding | schedule in the next release |

Response steps and contacts: `16-operations.md` §4.

## 8. Security testing done

- Manual XSS probes in product name, review text, contact message, admin notes.
- Direct REST calls with anon key against `orders`, `users`, `audit_log` → denied.
- Direct call to each admin RPC with a customer JWT → `admin only`.
- Tracking with a guessed token → no row.
- Header inspection after deploy (HSTS/CSP present).
- No automated SAST/DAST tool is in the repo; see `13-testing-qa.md` §9 for the gaps.
