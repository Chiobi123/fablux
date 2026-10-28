# FabluX.U.Design architecture

## Request flow

```
Browser
  └─ HTTPS ─> Static host / CDN  (HTML, CSS, JS, images)
  └─ HTTPS ─> Supabase Auth      (sign-up, sign-in, Google OAuth, reset)
  └─ HTTPS ─> Supabase PostgREST (products, orders, reviews, settings)
  └─ HTTPS ─> Supabase RPC       (create_order, track_order, contact, …)
  └─ HTTPS ─> Supabase Storage   (product images)
                     │
                     └─ PostgreSQL + Row Level Security
```

There is **no Node/Express application server**. The old `server/` directory
(SQLite + Express) was unused and has been removed. Keeping one backend avoids
two sources of truth and removes a server that would have to be patched,
deployed, and secured separately.

## Where the truth lives

| Data | Source of truth | Who can write |
|---|---|---|
| Product name, description, price, stock, image | `public.products` in PostgreSQL | admins only (RLS + `assert_admin()`) |
| Orders, totals, payment status | `public.orders` / `order_items` | `create_order()` and admin RPCs only |
| Customer profile | `auth.users` + `public.users` | the customer (own row) |
| Settings (store name, delivery fee) | `public.settings` | admins only; public keys are whitelisted |
| Reviews | `public.reviews` | signed-in customers (insert), admins (moderate) |
| Images | Supabase Storage `product-images` | admins only |

The browser never decides what a product costs. `create_order()` re-reads the
price and stock from `products` inside the database and recalculates the
subtotal, delivery fee, discount and total. Editing `localStorage`, the DOM, or
`products-data.js` in DevTools changes only what that one browser displays; it
cannot change what is charged or recorded.

## Frontend modules

| File | Responsibility |
|---|---|
| `js/api-client.js` | The only Supabase contract: auth, products, orders, RPC calls, admin calls |
| `js/backend-bridge.js` | Renders server data into the existing pages; form handlers; consent; escaping |
| `js/store.js` | Cart, wishlist, drawer, toasts (local UI state only) |
| `js/pro.js` | Search/sort/filter, wishlist/recent pages, recommendations |
| `js/admin.js` | Admin console rendering and admin RPC calls |
| `js/consent.js` | Cookie banner and consent-gated analytics |
| `js/a11y.js` | Skip link, labels, nav state, single-h1 fixes |
| `js/error-log.js` | Last-20 client errors, optional central endpoint |
| `js/products-data.js` | Offline fallback only; live data always overwrites it |

## Security boundary

* The only key in the browser is the Supabase publishable/anon key. It is
  public by design.
* Row Level Security is the authorization layer. The database rejects reads and
  writes that do not belong to the signed-in user or an admin.
* `SECURITY DEFINER` functions (`create_order`, `track_order`, `submit_contact`,
  `subscribe_newsletter`, `delete_my_data`) are the only public write paths for
  anonymous visitors, and each validates its input.
* The service-role key and database password live outside the web root in
  `_private-tools/.env` (not in git, never deployed).

## Deploy

```bash
node build.js     # builds dist/ with public files only
# deploy dist/
```

`build.js` aborts if it finds a secret in the output. See `SECURITY.md` for the
full checklist and `docs/` for backup, monitoring and load-test runbooks.
