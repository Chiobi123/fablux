# 18 — Administrator Manual

**Status:** current · last reviewed 2026-10-29
Applies to `admin.html` and the Supabase dashboard. The admin console has no public
link; you reach it by URL.

---

## 1. Getting access

1. Sign in at `login.html` (password or Google) with one of the approved addresses:
   - `fabluxdesigns@gmail.com`
   - `ujuigbani@gmail.com`
   - `igbanichiobiebere@gmail.com`
2. A database trigger creates the profile row and gives the account the admin role
   on first sign-in — email/password and Google both work. There is no invitation
   screen and no shared password.
3. The account menu now shows **Admin console**. Customers never see that link, and
   opening `/admin.html` while signed in as a customer simply returns to the
   account page (no "administrators only" screen, no hint that the console exists).

To check a role in the Supabase SQL editor:

```sql
select id, email, role from public.users order by created_at desc;
```

Changing the list requires editing `allowed_admin_email()` in
`setup-admin-emails.sql` and running it. Existing rows are re-derived by the same
script; a removed address falls back to customer immediately.

**Forgotten password:** use `forgot-password.html` with the same email. If email is
not configured, reset it from Supabase → Authentication → Users → *Reset password*.

## 2. Dashboard

The console is a two-column workspace: a **sidebar** for navigation and a wide
content area. The sidebar is grouped the way the shop is actually run:

| Group | Entries |
|---|---|
| Main | Dashboard, Orders, Products, Customers |
| Sales | Returns, Promo codes |
| Store | Store settings, Notifications |
| System | Audit trail |

Notifications carries a badge with the number of queued mails. The bottom of the
sidebar links to the storefront and the printable waybill. On screens under
980 px the sidebar collapses to a horizontal strip above the content.

**Dashboard** is the opening page, a read-only summary:

- a greeting with the signed-in administrator's first name and today's date;
- four cards — revenue this month, orders this month, orders awaiting payment,
  registered customers. The first two are compared with the previous calendar
  month; when that month had no orders the card shows "New" instead of a
  percentage;
- a 14-day daily-sales bar chart (hover a bar for the amount);
- orders by stage, the six most recent orders (click a row to open it) and a
  low-stock list.

The other entries (Orders, Products, Returns, Promo codes, Customers, Store
settings, Notifications, Audit trail) work as before; actions live there, not
here. Each page shows its own title and a one-line description at the top.
Figures are computed in the browser from the newest 500 orders, so they are a
working view rather than an accounting report.

## 3. Orders

### 3.1 Finding an order

- The list is newest first.
- Search by reference, customer name, email or phone.
- Filter by status or payment status.

### 3.2 Order statuses

| Internal | Shown to customer | Meaning |
|---|---|---|
| `pending_payment` | Order received | waiting for payment/confirmation |
| `payment_confirmed` | Payment confirmed | money received |
| `confirmed` | Order confirmed | accepted for fulfilment |
| `processing` | Preparing parcel | being packed |
| `ready_for_dispatch` | Ready for dispatch | awaiting courier |
| `shipped` | Collected by courier | with the courier |
| `delivered` | Delivered | completed |
| `cancelled` | Cancelled | stock released |

Move an order forward only when the real-world step has happened.

### 3.3 Changing status

1. Open the order.
2. Choose the new status.
3. Save.

Every change writes an `order_events` row (visible to the customer on the tracking
page) and an `audit_log` row (visible only to admins).

### 3.4 Payment status

`pending` → `successful` (or `failed` / `refunded`). Set `successful` only when the
money is actually in the account. This is separate from order status: an order can be
delivered while payment is pending (pay-on-delivery).

### 3.5 Courier

Enter the courier name, tracking number, dispatch date and optional notes. This is
what the customer sees on the tracking timeline. Leaving it blank is fine for local
delivery.

## 4. Products and stock

### 4.1 Adding a product

Required: name, price (naira, whole number), category, stock.
Optional: description, material, features (one per line), image, active flag.

1. Products → **New product**.
2. Fill the fields; upload an image (goes to the `product-images` bucket).
3. Save. It appears on the shop immediately if `active = 1` and stock > 0.

### 4.2 Editing

- Price changes apply to new orders only; existing orders keep the snapshot price.
- Stock is the number of units you physically have. The shop subtracts reserved
  stock from what customers can buy.
- Set `active = 0` to hide a product without deleting its history.

### 4.3 Removing

Deleting a product is allowed only if it is not referenced by an order. If it is,
deactivate it instead — order history must remain readable.

### 4.4 Images

The form states the rules inline next to the file picker:

- Square (1:1), JPG / PNG / WebP, at least 800×800 px, under 5 MB.
- Plain background, no text or watermarks — the shop crops the image to a square.
- Upload a file or paste a public URL. Uploading a replacement deletes the old file.
- A missing image falls back to a neutral placeholder; it does not break the page.

The Overview tab carries the same reminder next to a **Go to Products** button, so
"where do I add a product?" is answered on the first screen after sign-in.

## 5. Promo codes

Create percentage or fixed-amount codes with:

| Field | Meaning |
|---|---|
| code | what the customer types (case-insensitive) |
| kind | `percent` or `amount` |
| value | 10 = 10% or ₦10 depending on kind |
| min_subtotal | minimum order value for the code to apply |
| max_uses | 0 = unlimited |
| active | turn off without deleting |

Validation is server-side (`validate_promo`). The discount is recomputed inside
`create_order`; a tampered client cannot invent a discount.

## 6. Returns

Requests appear with the order reference, reason, details and date. Set the status as
you process it (requested → approved → received → refunded / rejected). Refunds are
manual until a payment processor is connected.

## 7. Notifications (outbox)

Every order event queues a row: recipient, subject, body, status.

- `pending` — written but not sent (no email provider is connected).
- `sent` / `failed` — set by a future sender.

The page states plainly when email is not configured. Until then, watch the outbox
daily so you know what customers *should* have been told, and contact them manually.

## 8. Customers

Read-only list of registered customers with order counts. You cannot see passwords.
Use it to answer "did this person order before?".

## 9. Audit log

Every administrative change: who (email), what action, which entity, when, and a
detail payload. Review it after any unusual activity or when a customer disputes a
change.

## 10. Settings

| Key | Effect |
|---|---|
| `store_name` | used in titles and emails |
| `store_contact` | phone shown on contact/policy pages |
| `store_email` | reply-to address |
| `store_address` | physical/business address |
| `delivery_fee_default` | standard delivery fee in naira |
| `delivery_fee_express_surcharge` | extra for express |
| `email_enabled` | declares whether outbound email is live |

**These are currently empty** for contact/address. Fill them before launch — policy
pages and the contact page read them.

## 11. Daily routine

1. Sign in; check the dashboard.
2. New orders → confirm payment or call the customer for pay-on-delivery.
3. Move paid orders to `processing`, then `ready_for_dispatch`, then `shipped` with a
   courier + tracking number.
4. Mark `delivered` when confirmed.
5. Process return requests.
6. Check stock and deactivate sold-out items (or set stock to 0).
7. Skim the audit log.

## 12. What the admin console cannot do

- Delete a customer's auth account (use Supabase → Authentication).
- Send email (no provider).
- Take card payments.
- Change the admin email allow-list (SQL deploy).
- Undo an order status change automatically (change it back manually; the audit log
  keeps both entries).

## 13. Escalation

For database-level problems, use `_private-tools/db.js query` or the Supabase SQL
editor. Read `07-database.md` before changing rows by hand — most actions have an RPC
that keeps the event log consistent.
