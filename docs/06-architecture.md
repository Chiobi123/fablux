# 06 — System Architecture

**Status:** current · last reviewed 2026-11-10
Short companion: `../ARCHITECTURE.md`.

---

## 1. Shape of the system

```
                    ┌───────────────────────────────┐
   Browser ────────►│ Static site (Cloudflare Pages)│
   (HTML/CSS/JS)    │  fab7/*.html  css/  js/       │
                    └───────────────┬───────────────┘
                                    │ HTTPS, publishable key + user JWT
                                    ▼
                    ┌───────────────────────────────┐
                    │ Supabase project              │
                    │  Auth      /auth/v1           │
                    │  PostgREST /rest/v1           │
                    │  RPC       /rest/v1/rpc/*     │
                    │  Storage   product-images     │
                    │  Postgres + RLS               │
                    └───────────────┬───────────────┘
                                    │
                          ┌─────────┴──────────┐
                          │ Google Translate   │ (optional, client-side
                          │ translate.google…  │  when a language ≠ EN)
                          └────────────────────┘
```

There is **no application server**. `vercel.js` / `netlify.toml` / `nginx.conf.example`
exist only as static-host configurations. The Express server was removed.

## 2. Why this shape

- **Cost:** static hosting + one managed database; no server to patch.
- **Attack surface:** the browser can only reach what RLS allows. There is no
  privileged API tier to compromise.
- **Latency:** PostgREST is a thin layer over Postgres; one round trip per screen.
- **Trade-off accepted:** business logic lives in SQL functions
  (`create_order`, `track_order`, admin RPCs). That is harder to unit-test than
  TypeScript, and it is why the SQL is reviewed carefully.

## 3. Components

### 3.1 Frontend

| File | Responsibility |
|---|---|
| `js/api-client.js` | the only network layer: Auth, REST, RPC, Storage; token handling; retries; friendly errors |
| `js/backend-bridge.js` | page wiring: renders catalogue, cart, checkout, account, admin; auth forms; OAuth |
| `js/store.js` | cart state and persistence (`fablux_cart_v1`) |
| `js/product.js`, `js/products-data.js` | product detail rendering, fallbacks |
| `js/script.js` | navigation, scroll header, hero slider, reveal animations |
| `js/pro.js` | shared UI: toasts, password toggle, formatting |
| `js/site-tools.js` | theme, language, reading progress, `--header-h` sync |
| `js/admin.js` | admin console screens (orders, products, promos, outbox, audit) |
| `js/a11y.js` | focus management, skip link, reduced motion, dialog handling |
| `js/consent.js` | consent banner and gating of non-essential scripts |
| `js/error-log.js` | captures uncaught errors into a bounded local buffer |
| `build.js` | copies the deployable subset into `dist/`, injects nothing, excludes secrets |

### 3.2 Database

18 tables, all with RLS enabled. See `07-database.md`.

### 3.3 RPC surface (SECURITY DEFINER)

`create_order`, `track_order`, `validate_promo`, `submit_contact`,
`subscribe_newsletter`, `unsubscribe_newsletter`, `delete_my_data`,
`admin_set_order_status`, `admin_set_payment_status`, `admin_set_courier`,
`admin_update_setting`, `admin_upsert_product`, plus helpers `is_admin()`,
`assert_admin()`, `rate_limit_hit()`.

## 4. Data flow: checkout

```
cart (localStorage, ids+qty only)
   │
   ├─ checkout.html reads products by id (fresh price/stock)
   ├─ user signs in → JWT in localStorage
   └─ api.createOrder(payload)
          └─ POST /rest/v1/rpc/create_order   (JWT)
                ├─ assert auth.uid()
                ├─ lock product rows, verify stock
                ├─ compute subtotal, delivery, discount, total
                ├─ insert orders + order_items
                ├─ reserve stock
                ├─ insert order_events('created')
                ├─ queue_notification(...)     → notifications row
                └─ audit(...)
   ← { id, reference, tracking_token }

pg_cron (every minute) → dispatch_emails() → Brevo HTTP API → notifications.sent
                        ↑ reads the API key from Supabase Vault
   → order-success.html?ref=…&token=…
```

## 5. Trust boundaries

| Boundary | Control |
|---|---|
| Browser → Supabase | publishable key only; user JWT for personal rows; RLS on every table |
| Browser → admin RPC | `assert_admin()` re-checks the role in the database, never trusts the UI |
| Browser → Storage | upload policies restrict to admin; public read only for product images |
| Third-party (Google) | only loaded when a non-English language is chosen; CSP allow-list |
| Build → repo | `build.js` refuses to copy `.sql`, `.env`, `node_modules`, docs, tools |

**Nothing in the frontend is a security control.** Hiding an admin link is cosmetic;
the database is the enforcement point.

## 6. Page inventory (28)

`index`, `shop`, `product`, `checkout`, `order-success`, `account`, `login`,
`register`, `forgot-password`, `reset-password`, `orders`, `track`, `returns`,
`recently-viewed`, `wishlist`, `about`, `contact`, `faq`, `privacy`, `terms`,
`cookies`, `refund-policy`, `admin`, `invoice`, `payment-callback`,
`unsubscribe`, `waybill`, `404`.

## 7. Rendering strategy

- Content pages are plain HTML: they render with CSS alone.
- Catalogue, cart, checkout, account and admin hydrate from Supabase after parse.
- No SSR, no hydration framework, no client router. Each page is a document.

## 8. Failure behaviour

| Failure | Behaviour |
|---|---|
| Supabase unreachable | `netFetch` retries 3× with backoff, then a human message |
| JWT expired | 401 → user is asked to sign in again; cart preserved |
| Google Translate blocked | page shows English after ≤10 s with a notice |
| localStorage blocked | cart/preferences fall back to memory for the session |
| Stock changed mid-checkout | `create_order` raises a readable out-of-stock error |

## 9. Scalability posture

- The static tier scales on the CDN with no changes.
- Postgres is the bottleneck: catalogue reads are indexed and cached by the CDN
  only at the HTTP layer (no server cache).
- Order creation is a short transaction with row locks on the ordered products;
  contention is limited to the same SKUs.
- No background worker process: notifications are rows in an outbox table, drained
  every minute by the `pg_cron` job `fx-email-dispatch` → `dispatch_emails()`, which
  posts to the Brevo HTTP API through `pg_net`. Nothing is sent by the browser.

Details and numbers in `14-performance.md` §7.
