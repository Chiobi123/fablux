# FabluX.U.Design — Frontend & Security Test Report

**Date:** 2026-10-28
**Architecture:** static HTML/CSS/JS + Supabase (PostgreSQL, Auth, Storage, RPC).
There is no Node/Express server; the unused `server/` folder was removed.

## Verified in this session

| Check | Result |
|---|---|
| JavaScript syntax (`node --check` on all `js/*.js`) | 12/12 pass |
| Console errors across 28 pages | 0 (Font Awesome CDN blocked in the sandbox is cosmetic only) |
| Internal links and assets | 0 broken |
| Homepage "Find Your Style" section | removed |
| Fake reviews / testimonials / star ratings | removed |
| Colour contrast (WCAG AA) across 16 pages | 0 failures |
| Live catalogue | 50 products loaded from Supabase |
| Shop search / sort / category deep link | working (`shop.html?category=men` shows 12 men's items) |
| Add to cart / cart drawer | working |
| Checkout totals | ₦95,000 + ₦2,500 delivery = ₦97,500 |
| Contact form → database | row written with `consent_at` and user agent; then deleted |
| Newsletter form → database | row written with consent; then deleted |
| Unsubscribe RPC | `unsubscribed_at` set on the live row |
| Rate limiting | 5 calls allowed, 6th blocked |
| Anon read of `users` / `orders` | HTTP 401 permission denied |
| Anon read of `settings` | only the 7 whitelisted public keys |
| Direct anon insert into `contacts` | HTTP 401 permission denied |
| Anon call to `delete_my_data()` | HTTP 401 permission denied |
| RLS enabled | every table in `public` |
| Google button wiring | redirects to Supabase `/auth/v1/authorize?provider=google`; provider must be enabled in Supabase |
| Secret scan of deployable files | clean; `build.js` aborts on secrets |
| `dist/` build | 65 public files, 0 missing assets |

## Not executed here (requires external infrastructure)

1. **100k / 1M concurrent-user load test.** The k6 script and capacity plan
   are in `loadtest/k6.js` and `docs/LOAD_TEST.md`. They must be run against a
   staging project and load generators.
2. **Backup restore test.** The procedure is in `docs/BACKUP_RESTORE.md`. A
   real restore needs a scratch Supabase project or local PostgreSQL.
3. **Google OAuth end-to-end.** The button and redirect are wired; the provider
   and allowed redirect URLs must be enabled in the Supabase dashboard.
4. **Live payment capture.** Checkout supports pay-on-delivery and bank
   transfer. Card payments need a PCI-compliant provider integration.

## Known external dependencies

* `images/products/*.jpg` are still 0-byte placeholders. The UI shows a branded
  "photo coming soon" fallback; real photos must be uploaded by the owner.
* Real business phone/address must be set in `public.settings`. The UI hides a
  placeholder phone number rather than publishing a fake one.
* Email delivery (order confirmations, unsubscribe links) requires a provider
  such as Resend and `email_enabled = true`.
