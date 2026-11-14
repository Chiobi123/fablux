# 03 — Software Requirements Specification (SRS)

**System:** FabluX.U.Design storefront
**Version:** matches repository state at asset token `20261114a`
**Status:** living · last reviewed 2026-11-10

Requirement IDs are stable; use them in commit messages and test notes
(e.g. `FR-4.2`). Each requirement is verifiable by hand in a browser or with SQL.

---

## 1. System context

A static site (`fab7/*.html`, `css/`, `js/`) served by a CDN, calling Supabase
directly. There is no application server. All authorization is enforced by
Postgres Row Level Security and `SECURITY DEFINER` functions.

## 2. Functional requirements

### 2.1 Catalogue

| ID | Requirement |
|---|---|
| FR-1.1 | The shop page lists products where `active = 1`, newest first, paginated client-side. |
| FR-1.2 | Price, name, image and stock shown in the shop/product pages come from `public.products`. |
| FR-1.3 | Search matches product name and category, case-insensitive. |
| FR-1.4 | Filters combine: category, price range, availability, search, sort. |
| FR-1.5 | A product with `stock = 0` is shown but cannot be added to the cart. |
| FR-1.6 | Product detail shows description, material, features and published reviews. |

### 2.2 Cart and checkout

| ID | Requirement |
|---|---|
| FR-2.1 | The cart persists in `localStorage` under `fablux_cart_v1`. |
| FR-2.2 | Adding a product stores only `{id, quantity}`; prices are re-read at checkout. |
| FR-2.3 | Checkout collects name, email, phone, address, city, state, landmark, instructions, delivery method, payment method. |
| FR-2.4 | Checkout requires a signed-in user (Supabase token) because `orders.user_id` is NOT NULL. |
| FR-2.5 | Checkout sends an idempotency key; repeating the same cart does not create a second order. |
| FR-2.6 | On success the customer is redirected to `order-success.html?ref=…&token=…`. |
| FR-2.7 | A promo code is validated server-side by `validate_promo(code, subtotal)`. |

### 2.3 Accounts

| ID | Requirement |
|---|---|
| FR-3.1 | Sign-up creates a Supabase Auth user and a matching `public.users` row. |
| FR-3.2 | The `apply_admin_role` trigger grants `admin` only for the approved emails. |
| FR-3.3 | Sign-in returns a JWT stored in `localStorage` (`fablux_api_token_v1`). |
| FR-3.4 | Password reset works by email link to `reset-password.html` (`/auth/v1/recover`). |
| FR-3.5 | Account page shows profile, addresses, orders, returns, wishlist. |
| FR-3.6 | Google sign-in uses Supabase OAuth; it is coded but disabled until the provider is enabled (see `09-auth.md`). |

### 2.4 Orders and tracking

| ID | Requirement |
|---|---|
| FR-4.1 | `create_order` re-reads price and stock, computes subtotal/delivery/discount/total, and writes `orders` + `order_items` atomically. |
| FR-4.2 | Every status change writes an `order_events` row with an actor. |
| FR-4.3 | `track_order(ref, token)` returns the order and its events for a valid token. |
| FR-4.4 | `track.html` accepts reference + token and renders the timeline without a login. |
| FR-4.5 | Cancelling an order releases reserved stock exactly once. |

### 2.5 Administration

| ID | Requirement |
|---|---|
| FR-5.1 | `/admin.html` requires `role = 'admin'`; every admin RPC re-checks with `assert_admin()`. |
| FR-5.2 | Admin can list/search orders, change status, payment status, courier. |
| FR-5.3 | Admin can create/update products, stock and promos. |
| FR-5.4 | Admin sees the notification outbox and the audit log. |
| FR-5.5 | Admin can change store settings (delivery fee, contact details, email toggle). |

### 2.6 Public forms

| ID | Requirement |
|---|---|
| FR-6.1 | Contact form → `submit_contact` (rate limited, stored in `contacts`). |
| FR-6.2 | Newsletter → `subscribe_newsletter`; unsubscribe → `unsubscribe_newsletter`. |
| FR-6.3 | All public write endpoints are rate limited by `rate_limit_hit`. |
| FR-6.4 | Reviews are limited to signed-in users who bought the product. |

### 2.7 Presentation

| ID | Requirement |
|---|---|
| FR-7.1 | Light/dark toggle persisted in `localStorage.fablux_theme`; dark is default. |
| FR-7.2 | Language switcher offers 79 languages; choice persisted in `localStorage.fablux_lang`. |
| FR-7.3 | Switching languages happens in place (no reload, no cover) and applies exactly the chosen language. |
| FR-7.4 | Reading-progress ring reflects scroll position and returns to top on activation. |
| FR-7.5 | The header never overlays page content, at any width. |

## 3. Non-functional requirements

| ID | Requirement | Verification |
|---|---|---|
| NFR-1 | No secret key in shipped files. Only the Supabase publishable key appears. | `node build.js` output + grep |
| NFR-2 | RLS enabled on every table that holds user data. | `setup-rls.sql`, `pg_class.relrowsecurity` |
| NFR-3 | Prices and stock are authoritative in the database. | code review of `create_order` |
| NFR-4 | WCAG 2.2 AA: contrast ≥ 4.5:1 body text, visible focus, labelled controls. | manual audit, `13-testing-qa.md` §6 |
| NFR-5 | No horizontal scroll at 320 px, 360 px, 768 px, 1024 px, 1440 px. | manual resize |
| NFR-6 | First meaningful paint under 2.5 s on a mid-range phone on 4G. | Lighthouse (threshold, not yet measured) |
| NFR-7 | CSP `script-src` allows only `self`, `unsafe-inline`, cdnjs and Google Translate hosts. | `_headers` |
| NFR-8 | Every page renders usable content with JavaScript disabled, except transactional pages. | manual check |
| NFR-9 | Failed network calls show a human sentence, never a raw stack. | `friendly()` in `api-client.js` |
| NFR-10 | The build excludes SQL, env, docs and tooling. | `build.js` `BLOCK` list |

## 4. Interfaces

- **User interfaces:** 28 HTML pages, listed in `06-architecture.md`.
- **Software interfaces:** Supabase REST (`/rest/v1`), RPC (`/rest/v1/rpc/*`),
  Auth (`/auth/v1`), Storage (`/storage/v1/object/public/product-images`).
- **Communication:** HTTPS only; `upgrade-insecure-requests` in CSP.

## 5. Assumptions

- One Supabase project serves production; no separate staging project exists.
- The browser has `localStorage`; if blocked, the cart and preferences are lost but
  the site still works.
- Google Translate is reachable when a non-English language is selected.

## 6. Out of scope

Listed in `01-product-requirements.md` §2.2.
