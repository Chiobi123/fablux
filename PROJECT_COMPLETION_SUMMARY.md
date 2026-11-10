# FabluX.U.Design — project status and handover

**Last updated:** 2026-11-10 · **State:** feature-complete for a
pay-on-delivery / bank-transfer shop, not yet traded publicly.
**Read this first, then `docs/README.md`.**

This file replaces an earlier summary that described a 5-page static mock
(Poppins, fake testimonials, "production ready"). That description stopped being
true when the backend landed; the content below matches the code as it is.

---

## 1. What this is

A static storefront (28 HTML pages, vanilla JS, no bundler) that talks directly to
a Supabase project. Postgres is the system of record for products, prices, stock,
orders, roles and email queues. There is no application server to deploy or patch.

| Fact | Value |
|---|---|
| Repo | `github.com/Chiobi123/fablux`, branch `main` |
| Supabase project | `msisbmcowtggbvasubla` |
| Hosting | Cloudflare Pages, build `node build.js`, output `dist/` |
| Mail | Brevo — SMTP relay on 465 for auth mail, HTTP API from `pg_cron` for app mail |
| Site asset token | `?v=20261110b` (bump on every CSS/JS change) |
| Pages | 28 |
| Languages | 79 options (English + 78 Google Translate targets) |

## 2. What works today (verified)

- Catalogue, search, filters, product pages, bag — all database-priced.
- Guest and signed-in checkout through `create_order`: server-side pricing, stock
  check and decrement, promo validation, delivery fee, idempotency.
- Order lifecycle with 8 statuses, a transition table, timeline events, audit rows
  and a customer email per milestone.
- Tracking by reference + token, no account needed; printable waybill.
- Accounts: sign-up, sign-in, Google OAuth, password reset, addresses, history,
  returns, reviews, data deletion.
- Admin console with sidebar dashboard: orders, payments, courier, products and
  stock, images, promos, returns, customers, outbox, audit log, settings. Access is
  decided by `is_admin()` in the database against a three-address allow-list.
- Transactional email end to end through Brevo, with explicit reply-to routing.
- Contact and newsletter forms: consent, rate limits, admin notification.

## 3. What is not done

| Item | State |
|---|---|
| Card payments (Paystack) | Edge Function and settlement SQL written, **not deployed**; option hidden at checkout |
| Two extra Brevo sender addresses | created, waiting on confirmation clicks |
| `settings.store_email` | still `info@fabluxudesign.com`, a mailbox nobody confirmed |
| Stock restored on cancel | **not implemented** — stock falls at order creation only |
| `reserved_stock` | read by the dashboard, written by nothing |
| Review moderation, contact inbox | no screens; SQL today |
| Email bounce feedback | `sent` means Brevo accepted, not delivered |
| Backup restore rehearsal | procedure written, never executed |
| Automated tests | none; verification is manual |

Full registers: `docs/01-product-requirements.md` §14,
`docs/22-project-plan.md` §3, `docs/19-support-and-releases.md` §2.

## 4. How the work actually runs

Every process — checkout, order lifecycle, the four payment paths, courier and
waybill, returns, reviews, contact and newsletter, the email outbox loop, auth and
roles, the admin daily routine, build and release, backup, incident response — is
specified step by step, naming the database function that owns each decision, in
**`docs/24-workflows.md`**.

## 5. Where to read next

| Question | File |
|---|---|
| What is the product, and what state is each capability in? | `docs/01-product-requirements.md` |
| How does each process run, and how does it fail? | `docs/24-workflows.md` |
| Every table, column and RLS policy | `docs/07-database.md` |
| Every REST/RPC/Auth call the browser makes | `docs/08-api.md` |
| Components, data flow, trust boundaries | `docs/06-architecture.md` |
| Third parties and whether they are live | `docs/23-integrations.md` |
| Tools, versions, deliberate omissions | `docs/11-tech-stack.md` |
| Build, deploy, rollback, smoke test | `docs/15-deployment.md` |
| Backups, restore, incidents, patches | `docs/16-operations.md` |
| Running the shop day to day | `docs/18-admin-manual.md` |
| Full documentation index (62 items) | `docs/README.md` |

## 6. Changing it safely

```bash
node --check js/<changed>.js     # syntax
node build.js                    # expect 68 files in dist/
```

Then bump `?v=` in every HTML file if CSS or JS changed, update the matching doc
and the change log in `docs/19-support-and-releases.md` **in the same commit**, and
push to `main`. Rules that must not regress are listed in
`docs/01-product-requirements.md` §7.

## 7. Before it trades

See `PRODUCTION_LAUNCH_CHECKLIST.md` (11 gates) and `docs/15-deployment.md` §6.
