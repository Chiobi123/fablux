# 04 — User Stories and Use Cases

**Status:** living · last reviewed 2026-10-29
Stories are written against the shipped behaviour. Each has acceptance criteria that
can be checked in a browser without reading the code.

---

## 1. Personas

- **Ada, guest shopper** — phone, Instagram traffic, no account, pays on delivery.
- **Tunde, returning customer** — has an account, tracks a refund.
- **Owner (admin)** — fulfils orders from a laptop.
- **Prospect** — reads About/FAQ/policies before trusting the brand.

---

## 2. Stories

### US-01 Browse the catalogue (Ada)

*As a guest I want to see what is for sale with prices, so I can decide whether to buy.*

Acceptance:
- `shop.html` lists only `active = 1` products.
- Each card shows name, price in ₦, and an image or a neutral placeholder.
- Search, category, price and availability filters all work together.
- Clearing filters restores the full list.

### US-02 Inspect a product (Ada)

*As a guest I want the details before I commit.*

Acceptance:
- `product.html?id=…` shows name, price, stock state, description, material, features.
- Sold-out products show a disabled add-to-cart action.
- Published reviews are listed with rating and date; there are no fabricated reviews.

### US-03 Build a cart (Ada)

*As a guest I want to add items and see a running total.*

Acceptance:
- Cart badge updates immediately.
- Quantity changes and removal persist across reloads (`fablux_cart_v1`).
- The cart has no price authority: server prices win at checkout.

### US-04 Check out (Ada)

*As a shopper I want to place the order and know it worked.*

Acceptance:
- Missing required fields are flagged inline before submission.
- Duplicate submission creates one order.
- Success page shows reference, items, totals, delivery and payment method.
- Failure shows a human message and keeps the cart intact.

### US-05 Track without an account (Ada)

*As a guest I want to check my delivery status.*

Acceptance:
- `track.html` accepts reference + token.
- A wrong token returns "not found", never another customer's data.
- The timeline shows each status change with a timestamp.

### US-06 Create an account (Tunde)

*As a returning customer I want my details saved.*

Acceptance:
- `register.html` creates the auth user and `public.users` row.
- Duplicate email is rejected with a readable message.
- The account page shows profile, addresses and order history.

### US-07 Reset a password (Tunde / owner)

*As a user who forgot the password I want to set a new one.*

Acceptance:
- `forgot-password.html` sends the Supabase recovery email.
- The link opens `reset-password.html` with a session; the new password is accepted.
- An expired link explains what to do.

### US-08 Sign in with Google (Ada)

*As a shopper I want one-tap sign-in.*

Acceptance (current state):
- The button exists on desktop and mobile.
- If the provider is disabled, a toast explains it and suggests email sign-in —
  the visitor is never sent to a raw JSON error page.
- When the provider is enabled, the visitor returns to `account.html` signed in.

### US-09 Manage orders (owner)

*As the owner I want to move an order through fulfilment.*

Acceptance:
- Admin sees all orders, newest first, filterable by status.
- Changing status/payment/courier is persisted and appears in `order_events`.
- Every change appears in `audit_log` with the actor's email.

### US-10 Manage stock (owner)

*As the owner I want stock to reflect reality.*

Acceptance:
- Editing stock in the admin console changes what the shop shows.
- An order reserves stock; cancelling returns it.
- Stock cannot go negative.

### US-11 Read the outbox (owner)

*As the owner I want to know which order alerts were written.*

Acceptance:
- `notifications` shows pending/sent rows with the order reference.
- The page states that email is not configured when `email_enabled = false`.

### US-12 Use the site in my language (Ada)

*As a shopper who does not read English well I want the interface translated.*

Acceptance:
- The globe pill lists languages with native names.
- Choosing one translates the page in place: no reload, no English flash.
- Choosing English removes the translation cookie.

### US-13 Read comfortably at night (Ada)

*As a shopper I want a light theme.*

Acceptance:
- The sun/moon control flips the theme and persists it.
- Text contrast stays AA in both themes.
- The hero photo remains visible but softened in light mode.

### US-14 Understand the policies (prospect)

*As a prospect I want delivery, returns and privacy terms before paying.*

Acceptance:
- Footer links reach Privacy, Terms, Cookies, Returns and Refund pages.
- Each page states the policy in plain language and a contact route.
- Policies are reachable on mobile without the header hiding content.

---

## 3. Use case: place an order (main flow)

1. Ada opens `shop.html`, filters by category.
2. She opens a product and adds it to the cart.
3. She opens `checkout.html`; because checkout needs a user, she signs in or registers.
4. She fills delivery details and picks "Pay on delivery".
5. The client calls `create_order` with items, address, delivery and an idempotency key.
6. `create_order` re-prices, checks stock, writes `orders` + `order_items`,
   reserves stock, queues a notification, writes an audit row.
7. She lands on `order-success.html?ref=…&token=…` and can bookmark it.
8. The owner sees the order in `/admin.html` and marks it "processing".

**Alternate flows**

- Out of stock → `create_order` raises a readable error; the cart stays.
- Duplicate tap → same idempotency key returns the original order.
- Session expired → the API returns 401; the client asks her to sign in again.

---

## 4. Use case: request a return

1. Tunde opens his account, selects a delivered order, chooses "Request return".
2. The client inserts into `returns` with the order id under his JWT.
3. RLS `returns_own` ensures he can only write rows for his own orders.
4. The owner reviews it in the admin console and updates the status.
