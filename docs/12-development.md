# 12 — Development Guide (code, setup, git, ADRs, dependencies, debt)

**Status:** current · last reviewed 2026-10-29
Repository: `https://github.com/Chiobi123/fablux.git` · branch `main` · site root `fab7/`

---

## 1. Repository layout

```
fab7/                         ← git root and web root
├─ *.html                     28 pages
├─ css/                       style, responsive, pro, site-tools, hardening
├─ js/                        see §2
├─ images/                    hero art (product photos live in Supabase Storage)
├─ _headers                   CSP + cache headers (Cloudflare/Netlify)
├─ _redirects?                not used
├─ build.js                   copies deployable files to dist/
├─ setup-*.sql                schema, RLS, RPCs, hardening (apply in order)
├─ loadtest/k6.js             optional read load test
├─ docs/                      this documentation set
├─ dist/                      build output, gitignored
└─ _private-tools/            sibling folder OUTSIDE git: db.js, .env, wipe SQL
```

`_private-tools/` sits next to `fab7/`, is never copied into `dist/`, and holds the
service-role key and DB credentials.

## 2. Source code map

| File | Lines (approx) | Responsibility |
|---|---|---|
| `js/api-client.js` | 700 | network layer: auth, REST, RPC, storage, retries, friendly errors |
| `js/backend-bridge.js` | 1 100 | page controllers: catalogue, cart, checkout, account, admin, auth forms, OAuth |
| `js/admin.js` | 900 | admin console rendering and actions |
| `js/store.js` | 260 | cart state + persistence |
| `js/pro.js` | 550 | shared UI primitives (toast, password toggle, formatting) |
| `js/script.js` | 300 | nav, hero slider, scroll effects, reveals |
| `js/site-tools.js` | 260 | theme, language, reading progress, `--header-h` |
| `js/product.js` | 160 | product detail page |
| `js/products-data.js` | 160 | static fallbacks for the catalogue |
| `js/a11y.js` | 140 | focus, skip link, dialogs, reduced motion |
| `js/consent.js` | 120 | consent banner and gating |
| `js/error-log.js` | 50 | local error ring buffer |
| `build.js` | 130 | deployable copy |

Conventions:

- IIFE per file, `'use strict'`, no globals except `window.FabluXAPI` and
  `window.FabluxStore`.
- `const` by default, arrow functions for callbacks, template strings for markup.
- Every value interpolated into `innerHTML` goes through `esc()`.
- No inline event handlers (`onclick=`); listeners are bound in JS.
- CSS: BEM-ish flat class names, custom properties for colour/spacing, mobile-first
  media queries.

## 3. Developer setup

```bash
git clone https://github.com/Chiobi123/fablux.git
cd fablux
node build.js                       # produces dist/
python -m http.server 8086 --directory fab7 --bind 127.0.0.1
# open http://127.0.0.1:8086
```

Notes:

- The preview server does **not** apply `_headers`; CSP and HSTS are only enforced on
  the real host. Do not "fix" a CSP issue by testing locally.
- Chrome caches HTML/CSS aggressively. Append `?cb=<timestamp>` when checking edits.
- `_private-tools/.env` (not in git) is required only for SQL application and
  backups:

```
SUPABASE_URL=…
SUPABASE_ANON_KEY=…
SUPABASE_SERVICE_ROLE_KEY=…
SUPABASE_DB_HOST=…
SUPABASE_DB_PORT=5432
SUPABASE_DB_USER=…
SUPABASE_DB_PASSWORD=…
```

```bash
node _private-tools/db.js apply setup-fulfilment.sql
node _private-tools/db.js query "select count(*) from public.products"
```

## 4. Build

`node build.js`:

1. Copies HTML, CSS, JS, images, `_headers`, `robots.txt`, `sitemap.xml`, `health.json`.
2. Blocks `.sql`, `.env`, `node_modules`, `docs`, `_private-tools`, `loadtest`,
   `dist`, dotfiles.
3. Prints the file count (currently 67).

`dist/` is gitignored. Cloudflare Pages publishes it (or the repo root, depending on
the project's build settings — keep the build command `node build.js` and the output
directory `dist`).

## 5. Git workflow

- Branch `main` is the deploy branch. Work happens on short-lived topic branches when
  more than one change is in flight; otherwise direct commits are acceptable for a
  single maintainer.
- Commit style: conventional prefix + scope, imperative mood:
  `fix(security): …`, `feat(site): …`, `docs: …`, `chore(build): …`.
- Every commit must leave `node --check` clean for changed JS and the tree runnable.
- Asset version bump (`?v=YYYYMMDDx`) is part of the same commit as the asset change.
- `.gitignore`: `dist/`, `node_modules/`, `.env`, `_private-tools/`, editor files.
- Never commit a service-role key, a DB password, or a real customer's data.

Release steps: see `15-deployment.md` §5.

## 6. Architecture decision records (ADR)

| ID | Decision | Why | Cost accepted |
|---|---|---|---|
| ADR-01 | Static site + Supabase, no application server | removes a server to patch; RLS is a stronger boundary than hand-written endpoints | business logic in SQL, harder to unit-test |
| ADR-02 | RLS as the only authorization layer | defence in depth without a second code path | every new table needs policies |
| ADR-03 | Prices and stock computed in `create_order` | client tampering is the top e-commerce risk | order RPC is long and must be reviewed |
| ADR-04 | Admin by email allow-list in SQL, not a UI role toggle | no privilege escalation path | adding an admin needs a SQL deploy |
| ADR-05 | Implicit OAuth flow (hash token) | the client calls `/authorize` directly, no SDK | cannot switch to PKCE without supabase-js |
| ADR-06 | Google Translate widget instead of hand-written i18n | 79 languages immediately, no translation maintenance | machine quality, external dependency, 1–10 s first switch |
| ADR-07 | Language switch drives the widget's own `select` in place (bubbling `change`) | Google swaps the text without a reload; switching is instant, never shows the previous language, and cannot drift to an unasked-for language | depends on the widget's private DOM; English falls back to one reload if the widget will not restore |
| ADR-08 | ~~"Translating…" cover instead of showing English then swapping~~ — superseded by ADR-07 (no cover) | the cover made every switch feel like a page load | brief old-language view while the widget first loads |
| ADR-09 | No hamburger menu; nav wraps | hiding navigation hurt discoverability more than a two-row header | header height varies; solved with `--header-h` |
| ADR-10 | Dark default, light opt-in | brand reads as premium in dark | two theme token sets to maintain |
| ADR-11 | Pay-on-delivery + bank transfer only | no PCI scope, no processor fees at launch | no instant card payment |
| ADR-12 | No automated test framework | no build step or runner to maintain for a 28-page static site | manual regression checklist (see debt TD-06) |

## 7. Dependency and licence inventory

| Package / asset | Where | Licence | Shipped |
|---|---|---|---|
| Font Awesome 6 Free | cdnjs | CC BY 4.0 (icons) / MIT (code) | via CDN |
| Playfair Display | Google Fonts | SIL OFL 1.1 | via CDN |
| Inter | Google Fonts | SIL OFL 1.1 | via CDN |
| Google Translate widget | Google | Google terms of service | via CDN, on demand |
| Supabase platform | hosted | Supabase ToS | service |
| Cloudflare Pages | hosted | Cloudflare ToS | service |
| `@supabase/supabase-js`, `pg` | `_private-tools/` only | MIT / MIT | not shipped |
| Node.js | build/tooling | MIT | not shipped |

There are **no npm runtime dependencies** for the website itself, so there is no
lockfile to audit for the deployed artefact.

## 8. Technical debt register

| ID | Debt | Impact | Trigger to fix |
|---|---|---|---|
| TD-01 | Legacy `users.password_hash`, `sessions`, `password_resets` tables unused | confusion, dead columns | after confirming no reader; drop in one migration |
| TD-02 | Admin email list hard-coded in SQL | adding an admin needs a deploy | when a third admin is needed |
| TD-03 | CSP allows `'unsafe-inline'` for scripts/styles | weaker XSS mitigation | when inline bootstrap can move to a hashed file |
| TD-04 | Order logic lives in a large SQL function | hard to unit-test | when order rules grow (partial refunds, multi-warehouse) |
| TD-05 | `delete_my_data` leaves the `auth.users` row | incomplete erasure | when a service-role job is added |
| TD-06 | No automated tests | regressions found by hand | before a second contributor joins |
| TD-07 | Machine translation used for legal pages | policy wording can drift | if the shop expands to a non-English jurisdiction |
| TD-08 | `dist/` not content-hashed, relies on `?v=` | stale assets if the token is forgotten | when a build step is acceptable |
| TD-09 | Product `features` stored as jsonb without a schema | malformed features render oddly | if features become filterable |
| TD-10 | No staging Supabase project | schema changes tested in production | before the first paid order |
| TD-11 | Email outbox has no sender | order alerts are only visible in admin | when a provider is chosen |
| TD-12 | No MFA on admin accounts | account takeover risk | when Supabase MFA is enabled on the plan |

Each item names the condition that makes it worth paying down — not a date.
