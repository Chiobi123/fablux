# 24 — Workflows and Operating Processes

**Status:** current · last reviewed **2026-11-10** · covers the system as shipped
through commit `fa6314e`
**Audience:** the owner running the shop, a developer changing it, an agent
picking it up cold.

This document answers *how work actually moves through the system*: which page
or cron triggers what, which database function owns the decision, which rows
change, and what happens when a step fails. `01-product-requirements.md` says
what the product must do; this file says how it does it.

---

## 1. How to read this

- `→` means "calls".
- **DB** marks the authoritative step: the decision is made by Postgres, not the
  browser.
- Every workflow ends with a **failure behaviour** line. If a step can fail
  silently, it says so.

Trust boundary, in one line: **the browser displays and requests; the database
decides.** Anything security-relevant in JavaScript is a convenience, not a
control.

---

## 2. Actors and enforcement points

| Actor | Can do | Enforced by |
|---|---|---|
| Guest | browse, bag, checkout with an email, track with ref + token | RLS: anon may select active products and settings, insert contacts/newsletter, execute `create_order`, `track_order` |
| Customer | everything a guest can do, plus history, addresses, returns, reviews, data deletion | `auth.uid()` row ownership policies |
| Administrator | full console | `is_admin()` = profile role `admin` **and** email in `allowed_admin_email()` **and** email equals the JWT email |
| Cron (`pg_cron`) | dispatch queued email | runs as the database owner inside `SECURITY DEFINER` functions |
| Edge Function (`service_role`) | settle a Paystack payment | `confirm_payment` granted to `service_role` only — currently not deployed |

Admin alerts, sender identity and the mail key live in the database (or Vault),
never in the page.

---

## 3. W1 — Browse, search, bag

1. `shop.html` loads → `FabluXAPI.products()` → PostgREST `products?active=eq.1`.
2. Search, category, price and availability filters run over the already-loaded
   list (no round trip per keystroke); sort is client-side.
3. Product page → `products?id=eq.…` plus reviews for that product.
4. "Add to bag" writes to `localStorage` (`fablux_cart_v1`); the header badge
   counts items.
5. Wishlist (`fablux_wishlist_v1`) and recently viewed (`fablux_recent_v1`) are
   device-local too. They are never attached to an account.

**Failure behaviour:** if the catalogue call fails, the shop shows an empty
state, not stale hard-coded products. Nothing is cached in HTML.

---

## 4. W2 — Checkout (order creation)

| # | Step | Actor | Backing |
|---|---|---|---|
| 1 | Form submit on `checkout.html` | browser | `backend-bridge.js` `handleCheckout()` |
| 2 | Bag read from device; if empty, stop | browser | — |
| 3 | Idempotency key reused if the cart + payment method are unchanged, otherwise regenerated | browser | `sessionStorage.fablux_idem` |
| 4 | `create_order` called with items, customer, delivery, payment, promo, key | DB | Postgres function, `SECURITY DEFINER` |
| 5 | Duplicate key? return the existing order unchanged | DB | `orders.idempotency_key` |
| 6 | Guest or account resolved into one email | DB | `auth.uid()` or `p_guest_email` |
| 7 | Validate name, phone, address, city, state, non-empty cart | DB | raises on the first failure |
| 8 | Lock each product row, re-read price and stock, merge duplicate lines | DB | `SELECT … FOR UPDATE` |
| 9 | Compute subtotal from **database** prices | DB | — |
| 10 | Delivery fee: `settings.delivery_fee`, plus `delivery_fee_express_surcharge` when express | DB | settings table |
| 11 | Promo: `validate_promo(code, subtotal)` → discount or an exception | DB | `promo_codes` |
| 12 | `total = max(0, subtotal + fee − discount)` | DB | — |
| 13 | Insert `orders` + `order_items`, decrement `products.stock` | DB | one transaction |
| 14 | Events: `order_received`, `payment_pending` | DB | `order_events` |
| 15 | Queue mail: 2 admin alerts, 1 customer receipt | DB | `queue_notification` |
| 16 | Return reference (`FX-YYYY-NNNNN`) + 24-byte tracking token | DB | — |
| 17 | Browser stores ref + token, redirects to `order-success.html` (or Paystack, if enabled) | browser | `localStorage` |

**Failure behaviour:** every validation and stock check raises inside the
transaction, so a failed checkout leaves **no** order, **no** stock movement and
**no** mail. The bag survives, the toast shows the database message. A repeated
submit with the same key returns the first order instead of creating a second.

**Known asymmetry:** stock is decremented at step 13 and is **not** returned if
the order is later cancelled — see §5 and `01` §14 item 4.

---

## 5. W3 — Order lifecycle

**Statuses** (`orders.status`): `pending_payment`, `payment_confirmed`,
`confirmed`, `processing`, `ready_for_dispatch`, `shipped`, `delivered`,
`cancelled`.

**Allowed transitions** — anything else raises `Invalid status change`:

| From | To | Owner action in the console |
|---|---|---|
| `pending_payment` | `payment_confirmed`, `confirmed`, `cancelled` | "Confirm payment" / "Confirm order" / "Cancel" |
| `payment_confirmed` | `confirmed`, `cancelled` | "Confirm order" / "Cancel" |
| `confirmed` | `processing`, `cancelled` | "Start preparing" / "Cancel" |
| `processing` | `ready_for_dispatch`, `cancelled` | "Ready for dispatch" / "Cancel" |
| `ready_for_dispatch` | `shipped`, `cancelled` | "Mark collected by courier" / "Cancel" |
| `shipped` | `delivered`, `cancelled` | "Mark delivered" / "Cancel" |
| `delivered` | — | terminal |
| `cancelled` | — | terminal |

Each transition (`admin_set_order_status`) does four things in one transaction:

1. updates `orders` (status, `status_updated_at`, `cancelled_at` / `delivered_at`);
2. inserts an `order_events` row with the human label and the acting email;
3. inserts an `audit_log` row (`order_status_change`, from → to);
4. queues customer mail for `confirmed`, `ready_for_dispatch`, `shipped`,
   `delivered`, `cancelled`, and admin mail for `confirmed` / `cancelled`.

**Stock:** releasing stock on cancel is **not implemented**. `products.stock` is
reduced at order creation only. `reserved_stock` exists and the dashboard
subtracts it, but no code writes it.

**Failure behaviour:** an illegal transition is refused before any write; a
concurrent double-click hits the row lock and the second call sees the new state.

---

## 6. W4 — Payments

`orders.payment_status`: `pending` → `successful` | `failed` | `refunded`.

### 6.1 Pay on delivery (live)

1. Order is created with `payment_method = 'pay-on-delivery'`, status
   `pending_payment`.
2. Goods are delivered; money changes hands.
3. Admin uses **Confirm payment** (`admin_set_payment_status('successful')`),
   which flips `payment_status`, writes an event + audit row and queues customer
   and admin mail.

### 6.2 Bank transfer (live)

1. Confirmation page shows the account details and asks the customer to use the
   order reference as narration.
2. Owner sees the credit in the bank app, opens the order, presses **Confirm
   payment** — the same function as above.
3. `payment_method = 'bank-transfer'` is what the order page reports.

### 6.3 Paystack (written, not deployed)

1. Checkout shows the card option only when `paystackEnabled()` is true
   (`api-client.js`), which depends on the function being deployed. Today it is
   hidden.
2. Order is created, then `paystackInitialize(ref, token)` → `payments` Edge
   Function → a `payment_transactions` row (`pending`, with `expires_at`) →
   authorization URL.
3. Customer pays; Paystack returns to `payment-callback.html`, which calls
   `verifyPaystack(reference)`.
4. The Edge Function re-verifies with the Paystack secret, then calls
   `confirm_payment(reference, amount)`.
5. `confirm_payment`: replay-safe (a settled row returns `already: true`), amount
   must match the transaction row, updates both rows, writes events + audit,
   queues customer and admin mail.

`expire_stale_payments()` closes abandoned `pending` rows; it is not scheduled —
run it before a retry or occasionally.

**Failure behaviour:** a webhook that arrives twice settles once. An amount
mismatch raises and nothing settles. With the function undeployed the card option
is never rendered, so nobody can reach a broken payment path.

---

## 7. W5 — Fulfilment, courier, waybill

1. Admin advances status through `processing → ready_for_dispatch`.
2. **Set courier** (`admin_set_courier`) records courier name, courier tracking
   number, dispatch time and notes, and appends a `courier_assigned` event + audit
   row. It does **not** change the status — that stays an explicit step.
3. `shipped` marks collection; `delivered` closes the order and stamps
   `delivered_at`.
4. `waybill.html` prints one order: reference, receiver, address, phone, items,
   courier and tracking number.
5. The customer follows the same events at `track.html?ref=…&token=…`; the token
   is unguessable, so the link works without an account.

**Failure behaviour:** a missing courier or tracking number blocks nothing — the
waybill prints blanks. Tracking refuses a wrong token.

---

## 8. W6 — Returns

1. Signed-in customer opens **Returns**, picks the order, gives a reason and
   details → `returnRequest()` inserts into `returns` with status `requested`.
2. Admin sees it under **Returns** and changes the status through
   `admin_return_status`: `requested → approved | rejected → received →
   refunded`. Any status can be set; the list is the source of truth.
3. The refund itself is manual (bank transfer). Nothing moves money
   automatically.

**Failure behaviour:** a return can be filed for any order the customer owns;
there is no date-window check and no automatic stock return.

---

## 9. W7 — Reviews

Signed-in customer posts rating (1–5) and text → row in `reviews`
(`status = 'published'`) → shown on the product page immediately. There is no
moderation screen and no per-customer-per-product uniqueness constraint; a
duplicate review is possible and is removed with SQL today.

---

## 10. W8 — Contact and newsletter

**Contact** (`submit_contact`):

1. Honeypot filled → returns success and writes nothing (silent bot drop).
2. Validate email, message presence, 4000-character cap, consent checkbox.
3. Rate limit: 5 per hour per email address.
4. Insert into `contacts` with consent timestamp and user agent.
5. Trigger `trg_contact_alert` queues one mail to each of the three admin
   addresses, with the **customer's** address as `reply_to`.

**Newsletter** (`subscribe_newsletter`): honeypot, consent, 3 per hour per
address, unique email. Unsubscribe (`unsubscribe_newsletter`) is rate-limited at
5 per hour and reachable from the link in every mail.

**Failure behaviour:** if mail dispatch is down, the enquiry is still stored;
the admin can recover it from `contacts` with SQL.

---

## 11. W9 — Email outbox (the dispatch loop)

Two independent mail paths. They share the same sender identity and reply
address, and nothing else.

| Path | Used for | Transport | Trigger |
|---|---|---|---|
| Auth mail | password reset, email confirmation when enabled | Supabase SMTP → `smtp-relay.brevo.com:465` | Supabase Auth |
| App mail | welcome, order milestones, payment, admin alerts, contact enquiries | `notifications` table → Brevo HTTP API | `pg_cron` job `fx-email-dispatch`, every minute |

### 11.1 The loop

1. Some action calls `queue_notification()` (or a trigger does). Row is inserted
   with `status = 'queued'` when `settings.email_enabled = 'true'`, otherwise
   `pending` with an explanatory error.
2. Every minute `dispatch_emails(20)` runs.
3. It exits immediately when email is disabled, or when the Vault secret
   `brevo_api_key` or the `email_settings` row is missing.
4. It selects up to 20 rows (`status = 'queued'`, `attempts < 4`, non-empty
   recipient) `FOR UPDATE SKIP LOCKED` — two overlapping runs cannot send the
   same row.
5. For each row it POSTs to `https://api.brevo.com/v3/smtp/email` through
   `pg_net`, then marks the row `sent` with `sent_at` and `attempts + 1`.
6. A failed POST increments `attempts` and stores `left(SQLERRM, 300)` in
   `error`; the row stays `queued` and is retried until four attempts.

### 11.2 What "sent" means

`sent` means **Brevo accepted the request**, not that the inbox received it. The
real response is kept by `pg_net` for about six hours and is not read back. This
is deliberate for now; a verification pass can be added if bounces must be
surfaced.

### 11.3 Reply routing

Reply address resolution, highest wins: `notifications.reply_to` →
`email_settings.reply_to` → `email_settings.from_email`. Contact enquiries set
the customer's address, so Reply answers the customer.

### 11.4 Failure behaviour

| Failure | Result |
|---|---|
| Brevo key missing / email disabled | loop returns 0, rows stay queued, check-out still works |
| Rate limit (100/hour on auth mail) | the message waits; app mail is unaffected |
| Brevo rejects a recipient | row goes back to `queued`, `error` records the reason, retried up to 4 times |
| Cron job missing | rows accumulate; the admin sees a growing queue in **Notifications** |
| Sender not verified in Brevo | API returns 400, row stays queued with the reason |

---

## 12. W10 — Accounts, auth, roles

1. Sign-up (email + password) or Google → `auth.users` row.
2. Trigger `trg_sync_auth_user` creates **exactly one** `public.users` row and
   assigns the role: `admin` if the email is on the allow-list, otherwise
   `customer`. Password hashes live only in Supabase Auth.
3. `trg_0_lock_user_email` refuses any later change of `public.users.email` that
   does not match the Auth email.
4. Sign-in returns a JWT; every request carries it; RLS uses `auth.uid()`.
5. Password reset: `forgot-password.html` → Supabase auth mail (Brevo SMTP) →
   link to `reset-password.html`.
6. Admin sign-in lands on `admin.html`. A customer who opens `admin.html` is
   redirected to `account.html`; a signed-out visitor to `login.html`.

**Adding an administrator:** add the address to `allowed_admin_email()` and let
`sync_auth_user` re-run (any auth update), or update the profile role directly —
then sign that user in again. Removing an address demotes the account on its next
sync, and `is_admin()` refuses immediately because it re-reads the allow-list.

---

## 13. W11 — Admin console: daily routine

| When | What |
|---|---|
| Morning | Dashboard: awaiting payment, low stock; Orders filtered to `pending_payment` |
| On bank alert | Open the order → **Confirm payment** |
| After packing | `processing → ready_for_dispatch`; set courier |
| On collection | `shipped`, then `delivered` when it lands |
| Weekly | Products: stock and active flags; Returns: pending requests; Notifications: any row with an error |
| When something looks wrong | Audit trail (who changed what), then `19-support-and-releases.md` §1 |

The console never silently rewrites history: every action writes an audit row.

---

## 14. W12 — Build and release

1. Change source files. CSS/JS change → bump `?v=` in every HTML file.
2. `node --check` on changed JS.
3. `node build.js` → `dist/` with 68 public files. `dist/` contains only pages,
   `css/`, `js/`, `images/`, `favicon.svg`, `robots.txt`, `sitemap.xml`,
   `health.json`, `_headers`, `.htaccess`. No SQL, no docs, no `.env`, no tooling.
4. Commit and push `main`. Cloudflare Pages runs `node build.js` (output `dist`)
   if the project is connected to the repo; otherwise `wrangler pages deploy dist`.
5. Smoke test (`15-deployment.md` §4.1): home, headers, shop, login, theme,
   language, admin redirect, `health.json`.
6. Rollback = Pages → Deployments → Rollback. Database is **not** rolled back by
   that; use `16-operations.md` §2.

**Failure behaviour:** a failed build leaves the previous deployment serving. A
bad deploy is rolled back in the dashboard, not with git revert.

---

## 15. W13 — Backup and restore

1. Scheduled Supabase backups (platform) plus the manual dump procedure in
   `BACKUP_RESTORE.md`.
2. Restore is performed into a staging project first, never over production.
3. After any restore: re-check `email_settings`, Vault secret `brevo_api_key`,
   `settings.email_enabled` and the admin allow-list, because those are the rows
   whose absence silently stops mail.

**Status:** the procedure is written; a restore has **not** been rehearsed.

---

## 16. W14 — Incident response

| Symptom | First check | Then |
|---|---|---|
| Storefront blank | Supabase status, key in `js/api-client.js`, console errors | rotate/restore key, redeploy |
| Orders failing | `create_order` error text in the toast | check `products.stock`, `settings`, RLS |
| No email | `notifications` newest rows, `settings.email_enabled`, `email_settings`, Vault secret, `cron.job` | re-enable, re-queue, resend |
| Wrong prices | `products` rows | fix rows, no deploy needed |
| Admin locked out | allow-list and profile role | reset password, fix role |
| Suspected leak | `audit_log`, Supabase auth logs | rotate keys (Vault + SMTP + publishable), redeploy |

Full runbooks: `16-operations.md` §4.

---

## 17 — Process timeline (what was built, when)

From git history, not from a plan. Phases overlap; each date is a merged commit
range.

| Date | Phase | What landed |
|---|---|---|
| 2026-10-25 | 0 — Skeleton | static luxury storefront, initial layout |
| 2026-10-25 | 1 — Backend | Supabase schema, API client, RLS policies |
| 2026-10-26 | 2 — Commerce | checkout, orders, tracking, admin console, waybill, returns |
| 2026-10-27 | 3 — Console | product manager, promos, customers, stats, mobile grid |
| 2026-10-28 | 4 — Hardening | RLS lockdown, rate limits, consent, legal pages, XSS escaping, safe build |
| 2026-10-29 | 5 — Comfort | language switcher rewrite, theme fix, honest Google sign-in, docs set |
| 2026-10-30 | 6 — Auth and admin repair | Google OAuth enabled, profile provisioning, admin-escalation closed, damage wipe recovery, account hub, admin overview |
| 2026-10-30 | 7 — Payments (code) | Paystack Edge Function and settlement SQL written, not deployed |
| 2026-10-31 | 8 — Email | Brevo SMTP live (port 465), outbox + cron + welcome trigger, reply routing, contact alerts |
| 2026-11-03 | 9 — Presentation | brand-first hero, sidebar admin dashboard with KPI cards |
| 2026-11-10 | 10 — Documentation | PRD rewritten to match the shipped system, this workflow document added |

---

## 18 — Failure to recovery matrix

| Failure | User sees | Data effect | Recovery |
|---|---|---|---|
| Catalogue call fails | empty shop | none | retry / fix key |
| Checkout validation fails | message in a toast | nothing written | correct and resubmit |
| Duplicate submit | normal confirmation | one order only | — |
| Stock short | "Not enough stock for …" | nothing written | restock |
| Email dispatch down | nothing | rows stay `queued` | fix key/cron, wait a minute |
| Email rejected 4× | nothing | row stuck `queued` with error | fix address, reset `attempts`, `status = 'queued'` |
| Payment confirmed twice | nothing | one settlement | replay protection |
| Cancel an order | confirmation | stock **not** restored | correct stock manually |
| Deploy breaks a page | old page still served | none | Pages rollback |
| Accidental row deletion | varies | data lost | restore from backup, then re-check mail settings |

---

## 19 — What is deliberately not automated

Listed so nobody assumes it exists:

- Stock release on cancel.
- Refunds (no money movement in software).
- Email bounce/complaint handling.
- Review moderation and contact-message inbox screens.
- Scheduling `expire_stale_payments()`.
- Backup verification (no scheduled restore test).
- Tagging or release automation — releases are commits and Pages deployments.
