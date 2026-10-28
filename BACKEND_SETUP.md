# FabluX.U.Design backend setup

> **There is no Node/Express server in this repository.** The backend is
> Supabase (PostgreSQL + Auth + Storage + RPC). The old `server/` folder was
> unused and has been removed. Do not start a separate API process.

## 1. Create the Supabase project

1. Create a project at <https://supabase.com>.
2. Copy the **Project URL** and the **publishable (anon) key** into
   `js/api-client.js` (these are public; RLS protects the data).
3. Keep the **service-role key** and **database password** out of the repo.
   Local-only credentials belong in `_private-tools/.env`, which is outside the
   web root and is never deployed.

## 2. Run the SQL, in this order

Open **SQL Editor** in Supabase and run each file:

1. `setup-supabase.sql` — tables, baseline policies.
2. `setup-rls.sql` — customer/admin row-level security.
3. `setup-fulfilment.sql` — order lifecycle, tracking, admin RPCs.
4. `setup-promo-codes.sql` — promo validation and discount rules.
5. `setup-product-images.sql` — storage bucket and admin-only upload policies.
6. `setup-admin-bootstrap.sql` — create/promote the first admin.
7. `setup-security-hardening.sql` — RLS on every table, rate limits, consent,
   data deletion, indexes, public-settings whitelist.
8. `setup-product-details.sql` — product description/material/features columns,
   price/stock constraints, and a hard block on anonymous product writes.

All scripts are idempotent.

## 3. Products

Products live in `public.products` and are the only source of price and stock.
Customers can read active products; only admins can insert or update them.
The storefront fetches them on every page load and overwrites the static
fallback cards.

If you need to edit a product, use the admin console (`admin.html`) or the
Supabase Table Editor while signed in as an admin. A customer cannot change a
price, stock level, image or description — RLS rejects the write.

## 4. Auth and Google

1. Authentication → Providers → Email: keep email confirmation on.
2. Authentication → Providers → Google: add the OAuth client ID/secret.
3. Add the production redirect URL, e.g.
   `https://fablux.pages.dev/account.html`, to the allowed redirect list.
4. Authentication → URL Configuration: set the Site URL to your production
   domain.

## 5. Settings

Set the public store details in `public.settings`:

| Key | Example |
|---|---|
| `store_name` | `FabluX.U.Design` |
| `store_email` | `info@fabluxudesign.com` |
| `store_contact` | a real phone number, or leave empty (the UI hides placeholders) |
| `store_address` | your real business address |
| `delivery_fee_default` | `2500` |
| `delivery_fee_express_surcharge` | `1500` |
| `email_enabled` | `false` until email is configured |

Only whitelisted keys are readable with the anon key.

## 6. Local development

Serve the static folder — no build step is required for development:

```bash
python -m http.server 8080 --directory fab7
# open http://127.0.0.1:8080
```

For production, build and deploy only `dist/`:

```bash
node build.js
```

## 7. What is intentionally not here

* No card data storage — use a PCI-compliant provider.
* No custom session server — Supabase Auth issues JWTs.
* No SQLite file — PostgreSQL is the database.
* No `.env` in the web root — secrets are in `_private-tools/.env` (local only)
  or in your host's environment settings.
