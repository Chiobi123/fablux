# 01 — Product Requirements Document (PRD)

**Product:** FabluX.U.Design — direct-to-consumer fashion storefront
**Owner:** FabluX.U.Design (single-operator business)
**Document owner:** repository maintainer
**Status:** living document · last reviewed 2026-10-29

---

## 1. Problem and opportunity

Independent fashion labels in Nigeria sell through Instagram DMs and WhatsApp.
That means: no catalogue, no stock truth, no order record, no receipts, and a
manual conversation for every sale. FabluX.U.Design replaces the DM thread with a
storefront that holds the catalogue, takes the order, writes it to a database, and
gives the customer a tracking reference they can check themselves.

## 2. Scope and objectives

### 2.1 In scope

- A public marketing surface: home, shop, product detail, about, contact, FAQ,
  policies.
- A catalogue of products with price, image, stock, category, material, features.
- Guest checkout that records an order (name, phone, address, delivery method,
  payment method).
- Customer accounts (email + password) with order history, addresses, returns,
  reviews, wishlist.
- Guest order tracking by reference + tracking token.
- An admin console for orders, stock, products, promotions, notifications, audit log.
- Six languages for the interface via a language switcher (machine translation).
- Light and dark presentation.

### 2.2 Out of scope (deliberately)

- Card payments. The shop supports pay-on-delivery and bank transfer only; adding a
  card processor is a separate decision with PCI implications (`23-integrations.md`).
- Multi-vendor marketplace behaviour.
- Native mobile apps.
- 18+ verification / age gates.
- A Node/Express application server. The site is static and talks to Supabase
  directly with Row Level Security as the enforcement point.

### 2.3 Objectives (12 months from launch)

| Objective | Measure | Target |
|---|---|---|
| Orders captured digitally | orders in `public.orders` | 100% of sales |
| Stock accuracy | orders rejected for stock after payment | 0 (stock is checked in `create_order`) |
| Support load | "where is my order" messages | reduced by self-serve tracking |
| Admin visibility | orders with an audit trail | 100% |

These are business targets, not code guarantees. No baseline exists yet because the
store has not traded, so no measurement has been taken.

## 3. Users

1. **Shopper (guest)** — browses, buys without an account, tracks with a reference.
2. **Shopper (account)** — repeat buyer; wants addresses, history, returns, reviews.
3. **Administrator** — the owner. Manages products, stock, orders, promotions,
   reads the notification outbox and audit log.
4. **Prospective customer** — reads About/FAQ/policies before buying.

## 4. Functional requirements (summary)

Numbered, testable requirements live in `03-srs.md`. Product-level summary:

- Catalogue is database-authoritative: prices, stock and names come from
  `public.products`, never from HTML or local storage.
- Checkout is idempotent: a double-tap cannot create two orders
  (client sends an idempotency key, `create_order` enforces it).
- Orders are traceable without an account via `track_order(ref, token)`.
- Admin access is restricted to two approved email addresses, enforced in the
  database (`allowed_admin_email` / `apply_admin_role` trigger), not in the UI.
- Every administrative state change is written to `audit_log`.

## 5. Non-functional requirements (summary)

- Works on a 360 px phone and a 1440 px desktop.
- No secret keys in the browser. Only the Supabase publishable (anon) key ships.
- WCAG 2.2 AA for contrast, focus, labels and keyboard use.
- Content Security Policy with no `unsafe-eval`; only `unsafe-inline` for styles and
  the small inline bootstrap script.
- The page must render without JavaScript for content pages (progressive
  enhancement); transactional pages require JavaScript.

## 6. Success criteria for "done"

1. A stranger can find a product, order it, and see a confirmation with a reference.
2. The owner can see that order in `/admin.html` without touching the database.
3. No error in the browser console on a clean load of any page.
4. The build (`node build.js`) contains no `.sql`, `.env`, `node_modules` or docs.

## 7. Assumptions and dependencies

- Supabase project `msisbmcowtggbvasubla` stays on a plan that includes Postgres,
  Auth and Storage.
- Cloudflare Pages (or any static host) serves `dist/`.
- Prices are integer naira; there is no multi-currency support.
- Machine translation (Google) is a convenience, not a legal translation of the
  policies. The English policy text governs.

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Supabase key revoked/rotated | storefront stops | rotate in `js/api-client.js`, redeploy |
| Product photos missing | low conversion | owner uploads to `product-images` bucket |
| Google provider disabled | no social sign-in | documented setup in `09-auth.md` |
| Machine translation outage | language switch falls back to English | 10 s guard + notice |
| Single admin account lockout | can't manage orders | reset via `forgot-password.html` |
