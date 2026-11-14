# 11 — Technology Stack

**Status:** current · last reviewed 2026-11-10

---

## 1. Summary

| Layer | Technology | Version / detail |
|---|---|---|
| Markup | HTML5, hand-written | 28 pages |
| Styles | CSS3 (custom properties, grid, clamp) | no preprocessor, no framework |
| Behaviour | Vanilla JavaScript (ES2020), IIFEs | no bundler, no framework |
| Data | Supabase Postgres 15 | project `msisbmcowtggbvasubla` |
| API | Supabase PostgREST + Postgres functions | `/rest/v1`, `/rest/v1/rpc` |
| Auth | Supabase GoTrue | `/auth/v1`, JWT |
| Storage | Supabase Storage | bucket `product-images` |
| Email | Brevo | SMTP relay `smtp-relay.brevo.com:465` for auth mail; HTTP API for the outbox |
| Scheduling | `pg_cron` job `fx-email-dispatch` + `pg_net` | every minute, inside Postgres |
| Secrets | Supabase Vault | `brevo_api_key`; never in the repo |
| Payments | Paystack via Supabase Edge Function (`supabase/functions/payments`) | **written, not deployed**; card option hidden |
| Translation | Google Website Translator | loaded only when language ≠ EN |
| Icons | Font Awesome 6 (cdnjs) | CSS + webfonts |
| Fonts | Google Fonts (Playfair Display, Inter) | `fonts.googleapis.com` |
| Hosting | Cloudflare Pages (`dist/`) | `_headers` for headers |
| Build | Node.js script | `node build.js`, no dependencies |
| DB tooling | Node.js + `@supabase/supabase-js` in `_private-tools/` | never deployed |
| Load test | k6 | `loadtest/k6.js`, optional |

## 2. Deliberate omissions

| Not used | Why |
|---|---|
| React/Vue/Svelte | 28 static pages do not justify a framework or a build toolchain |
| Tailwind | the design system is small enough to write by hand; avoids a build step |
| jQuery | not needed since IE support was dropped |
| Express/Node server | removed: it duplicated Supabase and added an attack surface |
| ORM | the schema is SQL-first; RPCs are reviewed directly |
| Stripe | not used — Paystack is the Nigerian processor |
| Paystack | written (`supabase/functions/payments` + `setup-payments.sql`) but **not deployed**, so the card option is hidden at checkout |
| Analytics SDK | consent-gated; no vendor selected yet |

## 3. Browser targets

Chrome/Edge 110+, Firefox 110+, Safari 16+, Samsung Internet 21+.
Uses `:focus-visible`, `clamp()`, CSS custom properties, `details/summary`,
`IntersectionObserver`, optional chaining. No polyfills ship.

## 4. Runtime dependencies (browser)

| Dependency | Loaded from | Purpose | Failure mode |
|---|---|---|---|
| Font Awesome 6 | cdnjs | icons | icons missing, layout intact |
| Google Fonts | fonts.googleapis.com | typography | system font fallback |
| Google Translate | translate.google.com | language switching | English + notice |

All three are in the CSP allow-list. None is required for core shopping.
Brevo, Supabase and Cloudflare are server-side and never called from the browser
directly — mail leaves from Postgres, not from the page.

## 5. Development dependencies

Only Node.js (18+) for `build.js` and `_private-tools/db.js`. `_private-tools`
needs `@supabase/supabase-js` and `pg` installed **there**, not in the site. Nothing
in the deployed site requires `node_modules`.

## 6. Versions and how to check

- Node: `node -v` (built and verified on v24).
- Site asset version: the `?v=` token in every HTML `<link>`/`<script>` tag,
  currently `20261114a`. Bump it on every asset change (`15-deployment.md` §2).
- Postgres/Supabase: platform-managed. RPC signatures are the contract.
- Supabase Edge Functions runtime: Deno, only used by `payments` (undeployed).

## 7. Why the stack fits

1. **One repository, no pipeline.** `node build.js` is the whole build.
2. **No server to secure.** RLS is the authorization layer.
3. **Cheap at zero traffic.** Static hosting free tier.
4. **Readable by one maintainer.** No framework upgrade treadmill.

The cost is paid in SQL complexity for order creation and in the absence of
component reuse. Both are documented as debt where they matter
(`12-development.md` §8).
