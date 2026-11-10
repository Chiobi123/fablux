# 01 — Product Requirements Document (PRD)

**Product:** FabluX.U.Design — direct-to-consumer fashion storefront with a
database-backed back office
**Owner:** FabluX.U.Design (single-operator business)
**Document owner:** repository maintainer
**Status:** current · last reviewed **2026-11-10** · supersedes the 2026-10-29 draft
**Asset version token at review:** `?v=20261110b`

| Read next | For |
|---|---|
| `03-srs.md` | numbered, testable requirements |
| `24-workflows.md` | every process end to end (this PRD says *what*, 24 says *how it runs*) |
| `07-database.md` | tables, columns, RLS, migrations |
| `08-api.md` | every RPC/REST call the browser makes |
| `23-integrations.md` | third parties and their live/not-live status |

---

## 1. Purpose of this document

A single statement of what FabluX.U.Design is, who it serves, what is built and
what is not, so that the owner, a new developer and a future agent all work from
the same picture. Product-level only: schema lives in `07`, endpoints in `08`,
process detail in `24`.

**Honesty rule for this file:** every capability carries a status. `Live` means
it runs in production today. `Built, not active` means the code exists and is
switched off on purpose. Nothing here is aspirational without being labelled.

---

## 2. Problem and opportunity

Independent fashion labels in Nigeria sell through Instagram DMs and WhatsApp.
That means no catalogue, no stock truth, no order record, no receipt, and a
manual conversation for every sale. A customer who asks "where is my order" gets
a human answer or none.

FabluX.U.Design replaces the DM thread with a storefront that holds the
catalogue, prices the order from the database, writes it down, emails the
customer and the owner, and gives the buyer a tracking link they can open
without an account.

## 3. Product definition

**In one line:** a static, database-authoritative shopfront for a small fashion
label, with guest checkout, self-serve order tracking, and a back office the
owner can run from a phone.

**What makes it different from a DM shop**

| Property | Consequence |
|---|---|
| Prices, stock and product copy live in Postgres, not in HTML | a price change needs no deploy and cannot be edited in the browser |
| Orders are written by a database function, not by the client | totals, discounts, stock and delivery fee are computed server-side |
| Every admin action is audited | the owner can answer "who changed this, when" |
| Tracking does not need an account | the buyer keeps one link with a token |
| Email is queued in the database and dispatched by cron | a failed send does not block checkout |

**What it is not:** not a marketplace (one seller), not a card-first shop (card
payments are written but not deployed), not a native app, not a CMS — content
changes go through the admin console or SQL by design.

---

## 4. Users and roles

| Role | Who | Gets | How the role is decided |
|---|---|---|---|
| Guest shopper | anyone | browse, bag, checkout with an email, track with reference + token | no account |
| Customer | registered account | order history, saved addresses, returns, reviews, password reset | `public.users.role = 'customer'` |
| Administrator | owner + two trusted inboxes | the full console (orders, stock, products, promos, returns, customers, outbox, audit, settings) | `public.users.role = 'admin'`, set by the `sync_auth_user` trigger from a fixed allow-list, mirrored into the JWT `app_metadata.role` |
| Prospective customer | anyone | about, FAQ, policies, contact form | — |

Administrator allow-list (2026-11-10): `igbanichiobiebere@gmail.com`,
`fabluxdesigns@gmail.com`, `ujuigbani@gmail.com`. Adding a fourth address is a
one-line SQL change plus a re-login (`09-auth.md` §5). The allow-list is enforced
in the database, not in the UI — hiding a button is not a control.

---

## 5. Scope

### 5.1 In scope and live

- 28 public pages: home, shop, product, about, contact, FAQ, track, account,
  orders, checkout, confirmation, invoice, returns, wishlist, recently viewed,
  sign-in/up/reset, unsubscribe, four legal pages, 404, admin, waybill.
- Catalogue with price, image, stock, category, material, features, active flag.
- Guest and signed-in checkout with server-side pricing, stock check, promo
  validation, delivery fee and idempotency.
- Pay-on-delivery and bank-transfer payments; admin confirms receipt.
- Order lifecycle with timeline events, customer email per milestone, tracking
  link, printable waybill.
- Customer self-service: history, addresses, returns, reviews, data deletion.
- Admin console: dashboard, orders, products and stock, promos, returns,
  customers, notification outbox, audit log, store settings.
- Transactional email through Brevo (auth mail by SMTP, app mail by API + cron).
- Contact enquiries and newsletter sign-ups, both rate-limited and consent-gated.
- 79 language options (English + 78 Google Translate targets), light/dark theme,
  WCAG 2.2 AA contrast, keyboard and screen-reader basics.
- Row Level Security on every table that holds customer or business data.

### 5.2 Built, not active

| Capability | Why it is off | Turn on by |
|---|---|---|
| Paystack card/transfer | Edge Function written, not deployed; keys not set | `15-deployment.md` §4.3, then `paystackEnabled()` returns true and the option appears at checkout |
| Extra verified Brevo senders (`fabluxdesigns@`, `ujuigbani@`) | confirmation links not clicked | click the two emails, then set `email_settings.from_email` |

### 5.3 Out of scope (deliberate)

- Multi-vendor marketplace behaviour.
- Native mobile apps.
- 18+ verification or age gates.
- A Node/Express application server — the site is static and talks to Supabase
  directly, with RLS as the enforcement point.
- Storing card numbers. Card data, when Paystack goes live, never touches the
  database.
- Multi-currency: prices are integer naira.

---

## 6. Functional requirements

Status key: **Live** · **Built, not active** · **Partial** (works, known gap
listed in §14) · **Not built**.

### 6.1 Storefront and catalogue

| # | Requirement | Status |
|---|---|---|
| F1 | Shop lists only `active = 1` products, newest first, with search, category/price/availability filters and four sort orders | Live |
| F2 | Product page shows photos, price, description, material, features, stock state and reviews | Live |
| F3 | Sold-out products stay visible but cannot be added to the bag | Live |
| F4 | Prices and names always come from the database; the bag shows indicative prices only until checkout re-prices | Live |
| F5 | Wishlist and recently-viewed are stored on the device, never linked to an account | Live |
| F6 | Product photos are served from the `product-images` storage bucket; admins upload from the console | Live |

### 6.2 Bag and checkout

| # | Requirement | Status |
|---|---|---|
| F7 | The bag survives reload; the badge shows item count; completing an order clears it | Live |
| F8 | Checkout works for guests (email required) and for signed-in customers (details pre-filled) | Live |
| F9 | Delivery: standard or express, fee from `settings.delivery_fee` / `express_surcharge` | Live |
| F10 | Promo codes are validated in the database against subtotal, expiry, usage limit and minimum spend | Live |
| F11 | A double-tap cannot create two orders — the client sends an idempotency key and `create_order` returns the existing order | Live |
| F12 | Stock is checked and decremented atomically inside `create_order`, with the row locked | Live |
| F13 | A failed order keeps the bag and shows the reason | Live |

### 6.3 Payments

| # | Requirement | Status |
|---|---|---|
| F14 | Pay on delivery: money moves at handover; the order is created unpaid | Live |
| F15 | Bank transfer: the confirmation page shows account details and the reference as narration; the admin marks payment successful | Live |
| F16 | Paystack: initialise, redirect, verify, settle by webhook, with amount match and replay protection in `confirm_payment` | Built, not active |
| F17 | Whatever the method, the order row flips `payment_status` to `successful` once, and only once | Live |

### 6.4 Orders, tracking and fulfilment

| # | Requirement | Status |
|---|---|---|
| F18 | Every order has a reference (`FX-…`) and a tracking token | Live |
| F19 | `track_order(ref, token)` returns header, items and timeline without an account | Live |
| F20 | Status changes follow the transition table in `24-workflows.md` §5; terminal states cannot move | Live |
| F21 | Each status change writes an `order_events` row, an `audit_log` row and, for confirmed / ready / shipped / delivered / cancelled, a customer email | Live |
| F22 | Courier, tracking number, dispatch time and notes are recorded and print on the waybill | Live |
| F23 | Admin alert goes to the two owner inboxes on confirm, cancel and payment success | Live |

### 6.5 Accounts and self-service

| # | Requirement | Status |
|---|---|---|
| F24 | Sign-up, sign-in, sign-out, password reset (email link), Google sign-in | Live |
| F25 | Profile, phone, saved addresses (add/delete) | Live |
| F26 | Order history with links to details and tracking | Live |
| F27 | Return requests with reason and status tracking | Live |
| F28 | Signed-in customers can post a review (1–5 stars + text); reviews are published immediately, there is no moderation screen and no per-product uniqueness, so duplicates are possible | Live |
| F29 | Self-service data deletion — `delete_my_data()` removes personal rows | Live |

### 6.6 Admin console

| # | Requirement | Status |
|---|---|---|
| F30 | Non-admins are redirected before any console markup is rendered | Live |
| F31 | Dashboard: greeting, month-over-month revenue and orders, awaiting payment, customers, 14-day chart, pipeline, recent orders, low stock | Live |
| F32 | Orders: filter by status, payment and search; open detail; advance status; confirm payment; set courier | Live |
| F33 | Products: create, edit, activate/deactivate, stock, images (upload/delete), features | Live |
| F34 | Promo codes: create, edit, delete, usage limit, expiry | Live |
| F35 | Returns: list and update status | Live |
| F36 | Customers: list with order counts | Live |
| F37 | Outbox: recent email rows with status and error | Live |
| F38 | Audit log: who did what and when | Live |
| F39 | Settings: store details, delivery fee, email switch | Live |
| F40 | Review moderation | Not built — reviews are stored and displayed; removing one is a SQL edit today |
| F41 | Contact-message inbox | Not built — enquiries arrive by email only |

### 6.7 Email and notifications

| # | Requirement | Status |
|---|---|---|
| F42 | Password reset / auth mail is sent by Supabase through the Brevo SMTP relay (port 465), capped at 100/hour | Live |
| F43 | App mail (welcome, order milestones, payment, admin alert, contact enquiry) is queued in `notifications` and posted to the Brevo API by a `pg_cron` job every minute | Live |
| F44 | Every message carries an explicit `replyTo`, so replying reaches a real inbox (customer address for enquiries) | Live |
| F45 | A row stops after 4 attempts; the error text is kept for the admin | Live |
| F46 | Delivery confirmation (bounce/complaint feedback from Brevo) | Not built — a row is marked `sent` when Brevo accepts it, not when the inbox receives it |

### 6.8 Contact, newsletter, consent

| # | Requirement | Status |
|---|---|---|
| F47 | Contact form: validation, honeypot, consent required, 5 messages/hour per address, row in `contacts`, email to all three admins | Live |
| F48 | Newsletter: consent required, 3 sign-ups/hour per address, unsubscribe link by email | Live |
| F49 | Cookie/consent banner gates analytics | Live (no analytics vendor chosen) |

### 6.9 Presentation

| # | Requirement | Status |
|---|---|---|
| F50 | Light and dark themes, preference persisted, no flash on load | Live |
| F51 | 79 language options (English + 78 Google Translate targets); the choice persists and the page reloads translated, with a fallback notice if Google is unreachable | Live |
| F52 | Contrast ≥ WCAG AA in both themes, visible focus rings, labels on every field, skip link | Live, manual checks only |
| F53 | Home hero leads with the FabluX wordmark, not a slogan | Live (2026-11-03) |

### 6.10 Legal and data protection

| # | Requirement | Status |
|---|---|---|
| F54 | Privacy, terms, cookie and refund policies published and linked in the footer | Live |
| F55 | Consent recorded with a timestamp on contact and newsletter rows | Live |
| F56 | Signed DPA with Supabase / registered DPO | Not built — see `10-security.md` §6 |

---

## 7. Invariants that must not regress

These are the rules a future change is not allowed to break. Each is enforced in
code or in the database, and each has a test in `13-testing-qa.md` §8.

1. **The database is authoritative** for price, stock, role, order totals and
   promo validity. The browser may display, never decide.
2. **Admin is a database fact.** `is_admin()` reads the JWT role; the allow-list
   trigger assigns it. No page decides admin-ness by itself.
3. **RLS on every data table.** A new table ships with its policies in the same
   SQL file.
4. **Every admin mutation writes `audit_log`.**
5. **Order creation is idempotent** and stock-checked under a row lock.
6. **No secret in the frontend.** Only the Supabase publishable key ships.
7. **Escaping:** every interpolated value in `innerHTML` goes through `esc()`.
8. **Emails carry an explicit reply-to**, and the contact form replies to the
   customer, not to the store.
9. **Rate limits** stay on contact (5/h), newsletter (3/h) and auth mail (100/h).
10. **`?v=` asset token bumps** whenever CSS or JS changes.

---

## 8. End-to-end workflows

Summarised here, specified step by step in **`24-workflows.md`**:

| Workflow | Trigger | Outcome |
|---|---|---|
| W1 Browse → bag | visitor opens the shop | device-local bag, DB-priced items |
| W2 Checkout | Confirm order | `orders` + `order_items` rows, stock decremented, emails queued |
| W3 Order lifecycle | admin advances the order | status, `order_events`, audit, customer email |
| W4 Payment confirmation | admin verifies transfer (today) / webhook (when Paystack ships) | `payment_status = successful`, alerts |
| W5 Fulfilment and delivery | admin sets courier, marks shipped/delivered | waybill data, tracking timeline |
| W6 Return | customer requests, admin decides | `returns` row and status |
| W7 Review | customer submits after purchase | review row visible on the product |
| W8 Contact / newsletter | visitor submits a form | row, admin email / subscriber row, consent timestamp |
| W9 Email dispatch | cron every minute | queued rows posted to Brevo, status updated |
| W10 Auth and roles | sign-up, sign-in, reset | auth user, profile mirror, role from allow-list |
| W11 Admin operations | daily routine | orders moved, stock corrected, settings changed |
| W12 Build and release | `node build.js` + push | `dist/` deployed, old deployment available for rollback |
| W13 Backup and restore | scheduled dump | restorable snapshot, procedure rehearsed |
| W14 Incident | outage, bad deploy, leaked key | rollback / rotate / restore |

---

## 9. Data and system of record

| Domain | Tables | Notes |
|---|---|---|
| Identity | `auth.users` (Supabase), `public.users` | profile mirrored by trigger; email locked after creation |
| Catalogue | `products` | price, stock, `reserved_stock` (read by the dashboard, written by nothing — see §14) |
| Selling | `orders`, `order_items`, `payment_transactions` | totals computed in `create_order` |
| Fulfilment | `order_events`, `returns` | timeline and return status |
| Money | `payment_transactions` | one row per gateway reference |
| Communication | `notifications`, `email_settings`, `contacts`, `newsletter_subscribers` | outbox pattern; sender identity is a single row |
| Governance | `audit_log`, `rate_limit_hits`, `settings` | who/what/when, abuse control, public config |
| Customer extras | `addresses`, `reviews` | own-row policies |

---

## 10. Non-functional requirements

| Area | Requirement | Evidence |
|---|---|---|
| Responsiveness | usable from 360 px to 1440 px | `05-ui-ux.md` §6 |
| Performance | storefront renders without waiting on the database for layout; catalogue loads once | `14-performance.md` |
| Security | RLS everywhere, scores: anon cannot read `email_settings`, `dispatch_emails` or `notifications` (401) | `10-security.md` §5 |
| Accessibility | WCAG 2.2 AA contrast, focus visible, labels, skip link, no motion for reduced-motion users | manual checks only |
| Privacy | consent-gated analytics, data deletion, no card data stored | `10-security.md` §6 |
| Reliability | order creation atomic; email failure never blocks checkout | `24-workflows.md` §10 |
| Operability | single-operator runbook, backup + rollback written down | `16-operations.md` |
| Portability | static output; host-agnostic headers in `_headers` | `15-deployment.md` §3.4 |

---

## 11. Success criteria

**Definition of done for a change** (`12-development.md`, `22-project-plan.md` §6):

1. The behaviour works in the browser, not only in the code.
2. The database refuses the operation when the role is wrong.
3. Docs and change log are updated in the same commit.
4. `node --check` passes on changed JS and `node build.js` succeeds.
5. No secret, no console error, no horizontal scroll at 360 px.

**Launch criteria** (`15-deployment.md` §6.3) — the shop is launchable when:

- contact and delivery settings contain real business details;
- one real order has been placed, confirmed, shipped and delivered end to end;
- email lands in a real inbox for welcome, order and enquiry;
- a backup has been taken and restored once into a staging project.

Measured to date: none of the above business metrics has been measured, because
the store has not traded publicly yet. Do not present estimates as results.

---

## 12. Assumptions, dependencies, constraints

- Supabase project `msisbmcowtggbvasubla` stays on a plan with Postgres, Auth,
  Storage and `pg_cron` + `pg_net`.
- Cloudflare Pages serves `dist/`; the repository build command is
  `node build.js` with output `dist`.
- Brevo stays the mail provider; the API key lives in Supabase Vault.
- One operator. No on-call rotation, no staging environment — production is the
  test bed after a manual smoke test.
- English is the source language; the other 79 are machine translation and the
  English policy text governs.
- Prices are integer naira; there is no tax engine.

## 13. Risks

| Risk | Impact | Mitigation | Residual |
|---|---|---|---|
| Supabase key rotated or leaked | storefront down or data exposed | key in `js/api-client.js`, rotate + redeploy; RLS limits blast radius | medium until key rotation is rehearsed |
| Mail lands in spam (freemail sender) | customer misses confirmation | explicit reply-to, SPF/DKIM on a real domain | **open** — the durable fix is a domain mailbox |
| Cancel does not restore stock | phantom stock loss | admins correct stock by hand today | **open** — see §14 |
| Single admin lockout | cannot manage orders | password reset; three allow-listed addresses | low |
| `info@fabluxudesign.com` printed on the contact page | enquiries bounce | change `settings.store_email` | **open** — domain ownership unconfirmed |
| No delivery confirmation for email | silent bounces | outbox shows what was attempted | accepted |
| Restore never rehearsed | unknown recovery time | procedure written in `16-operations.md` §3 | medium |

---

## 14. Open items (as of 2026-11-10)

Ordered by what blocks trading.

| # | Item | Why it matters | Blocker |
|---|---|---|---|
| 1 | Verify Brevo senders `fabluxdesigns@gmail.com`, `ujuigbani@gmail.com` | sender identity for order mail; standby address | click two confirmation emails |
| 2 | Replace `settings.store_email` (`info@fabluxudesign.com`) with a mailbox that exists | the contact page publishes an address nobody reads | owner: does the domain exist? |
| 3 | Deploy the payments Edge Function + set Paystack keys | card option stays hidden until then | Supabase access token + secret key |
| 4 | Restore stock when an order is cancelled | cancelled orders leave stock short | code change in `admin_set_order_status` |
| 5 | `reserved_stock` is read by the dashboard but written by nothing | "available" equals `stock`; the column implies a reservation model that does not exist | either implement reservation or drop the column from the calculation |
| 6 | Admin alerts hard-code two addresses while contact alerts use three | one admin misses order mail | align on the allow-list table |
| 7 | No email delivery/bounce feedback | "sent" means accepted by Brevo | optional verification pass |
| 8 | No contact-message or review-moderation screen | admin needs SQL for both | build only if volume justifies it |
| 9 | Rotate the Brevo SMTP and API keys (both were displayed on screen) | secret hygiene | owner does it in Brevo + Vault |
| 10 | Rehearse a restore into a staging project | unknown RTO | maintainer |

---

## 15. Roadmap (ordered, no dates promised)

1. Close items 1–3 above (mail identity, real address, payments).
2. Fix stock on cancel and settle `reserved_stock`.
3. Rehearse a backup restore; record the time it took.
4. Run one real end-to-end order and record the result in `19` §5.
5. Then, and only then, decide whether the contact inbox or review moderation
   earns its keep.

---

## 16. Change history of this document

| Date | Change |
|---|---|
| 2026-10-29 | First version (pre-email, pre-OAuth, six languages claimed) |
| 2026-11-10 | Rewritten against the shipped system: real status per capability, 79 languages, guest checkout, email outbox, three admins, Paystack written-but-not-deployed, open-items register, workflows split into `24-workflows.md` |
