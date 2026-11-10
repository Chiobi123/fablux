# 07 — Database Design, Schema and Migrations

**Status:** current · last reviewed 2026-11-10
Source of truth: `setup-supabase.sql`, `setup-fulfilment.sql`, `setup-rls.sql`,
`setup-admin-emails.sql` (admin allow-list, auth-user sync, email lock),
`setup-security-hardening.sql`, `setup-promo-codes.sql`,
`setup-product-details.sql`, `setup-product-images.sql`,
`setup-admin-bootstrap.sql`.

Project: `https://msisbmcowtggbvasubla.supabase.co` (Postgres 15, Supabase).

---

## 1. ERD (logical)

```
auth.users (Supabase)
   │ 1:1
   ▼
public.users ──1:N──► addresses
   │                  orders ──1:N──► order_items
   │                    │ └─1:N──► order_events
   │                    │ └─1:N──► payment_transactions
   │                    └─1:N──► notifications
   ├──1:N──► reviews ──N:1──► products
   ├──1:N──► returns
   ├──1:N──► password_resets   (legacy, auth now owns reset)
   └──1:N──► sessions          (legacy, JWT is stateless)

products ──1:N──► order_items (product_id kept as a snapshot reference)
settings, promo_codes, rate_limit_hits, audit_log, contacts,
newsletter_subscribers  — standalone
```

`public.users.id` is the Supabase Auth user id (text), not a serial.

## 2. Tables

### 2.1 Identity

| Table | Columns | Notes |
|---|---|---|
| `users` | `id` (PK, auth uid), `email` UNIQUE, `password_hash`, `name`, `phone`, `role` (`customer`\|`admin`), `created_at`, `updated_at`, `payment_status`, `payment_reference`, `paid_at`, `deleted_at` | `password_hash` is legacy from the pre-Supabase design and is **not** used; credentials live in `auth.users`. See debt TD-01. |
| `password_resets` | `id`, `user_id`→users, `token_hash` UNIQUE, `expires_at`, `used_at`, `created_at` | legacy; Supabase `/auth/v1/recover` is the live path |
| `sessions` | `id`, `user_id`→users, `token_hash` UNIQUE, `expires_at`, `created_at` | legacy; JWT sessions are stateless |

### 2.2 Catalogue

| Table | Columns |
|---|---|
| `products` | `id` (PK), `name`, `price` (INTEGER ₦, ≥0), `category`, `image`, `active` (1/0), `stock` (≥0), `reserved_stock` (≥0), `description`, `material`, `features` (jsonb array), `created_at`, `updated_at` |
| `reviews` | `id`, `user_id`→users, `product_id`, `rating` 1–5, `text`, `status` (`published`\|`hidden`), `created_at` |

### 2.3 Orders

| Table | Columns |
|---|---|
| `orders` | `id`, `reference` UNIQUE, `user_id`→users, `status`, `subtotal`, `delivery_fee`, `discount`, `promo_code`, `total`, `payment_method`, `payment_status`, `delivery_method`, `customer_name`, `email`, `phone`, `address`, `city`, `state`, `landmark`, `instructions`, `notes`, `currency` (NGN), `tracking_token` UNIQUE, `idempotency_key` UNIQUE, `courier`, `courier_tracking`, `dispatched_at`, `delivered_at`, `cancelled_at`, `status_updated_at`, `payment_updated_at`, `created_at`, `updated_at` |
| `order_items` | `id` BIGSERIAL, `order_id`→orders CASCADE, `product_id`, `name`, `price`, `quantity` (>0) — price/name are snapshots at purchase time |
| `order_events` | `id`, `order_id`→orders CASCADE, `event`, `label`, `actor`, `created_at` |
| `payment_transactions` | `id`, `order_id`→orders CASCADE, `provider`, `reference` UNIQUE, `amount` (**kobo**), `currency`, `status`, `provider_status`, `expires_at`, `verified_at`, timestamps. One live `pending` row per order (`idx_payment_tx_live`). Written only by the payments Edge Function. |
| `returns` | `id`, `user_id`→users CASCADE, `order_id`, `reason`, `details`, `status` (`requested`…), `created_at` |

### 2.4 Operations

| Table | Columns |
|---|---|
| `settings` | `key` PK, `value` (text), `updated_at` |
| `promo_codes` | `code` PK, `kind` (`percent`\|`amount`), `value` (>0), `min_subtotal`, `max_uses` (0 = unlimited), `used_count`, `active`, `created_at` |
| `notifications` | `id`, `order_id`, `event`, `channel`, `recipient`, `subject`, `body`, `status` (`pending`\|`sent`\|`failed`), `error`, `attempts`, `created_at`, `sent_at`, `reply_to` (overrides the default reply address for that message) |
| `audit_log` | `id`, `actor_id`, `actor_email`, `action`, `entity`, `entity_id`, `detail` jsonb, `created_at` |
| `rate_limit_hits` | `id`, `bucket`, `subject`, `created_at` |
| `contacts` | `id`, `name`, `email`, `subject`, `message`, `created_at` |
| `newsletter_subscribers` | `id`, `email` UNIQUE, `created_at` |
| `email_settings` | `id` (always 1), `from_email`, `from_name`, `reply_to`, `updated_at`. RLS on, **no policy** — only `dispatch_emails()` and service_role read it. |

### 2.5 Settings keys in use

`store_name`, `store_contact`, `store_email`, `store_address`,
`delivery_fee_default`, `delivery_fee_express_surcharge`, `email_enabled`.

Store contact values are **empty** until the owner saves them in the admin console.

## 3. Row Level Security

RLS is enabled on every public table. Policies are in `setup-rls.sql` and
`setup-fulfilment.sql`.

| Table | Customer | Admin |
|---|---|---|
| `products` | SELECT where `active = 1` | ALL |
| `orders` | SELECT own (`user_id = auth.uid()`), INSERT via RPC only | ALL |
| `order_items` | SELECT where the parent order is theirs | ALL |
| `order_events` | SELECT own order | ALL |
| `addresses` | ALL own | — |
| `reviews` | INSERT/SELECT own; SELECT published | ALL |
| `returns` | SELECT/INSERT own | ALL |
| `users` | SELECT own row; no role self-escalation (trigger) | SELECT ALL |
| `settings` | SELECT public keys via RPC/anon | ALL |
| `promo_codes` | no direct access; validated by RPC | ALL |
| `notifications`, `audit_log` | none | ALL |
| `rate_limit_hits` | INSERT via SECURITY DEFINER helper only | ALL |
| `contacts`, `newsletter_subscribers` | INSERT via RPC only | SELECT (admin) |

Admin determination: `public.is_admin()` requires `public.users.role = 'admin'`, an
email in `allowed_admin_email()`, **and** that email matching `auth.jwt()->>'email'`.
`trg_sync_auth_user` on `auth.users` creates the matching `public.users` row for
every sign-up (including OAuth); `trg_0_lock_user_email` keeps the row's email equal
to the Auth-owned address. See `setup-admin-emails.sql`.

Original note: `public.is_admin()` reads `public.users.role` for `auth.uid()`.
The role is assigned only by `apply_admin_role` (trigger on `users` insert/update),
which compares `email` to `allowed_admin_email()`:

```
fabluxdesigns@gmail.com
ujuigbani@gmail.com
igbanichiobiebere@gmail.com
```

Changing that list requires editing the SQL function — it is not a UI setting.

## 4. Migrations

There is no migration framework. The SQL files are applied **in this order** with
`node _private-tools/db.js apply <file>` (uses `SUPABASE_DB_*` from
`_private-tools/.env`) or by pasting into the Supabase SQL Editor.

1. `setup-supabase.sql` — core tables
2. `setup-rls.sql` — RLS policies
3. `setup-fulfilment.sql` — order lifecycle, outbox, audit, rate limits, RPCs
   - `setup-admin-emails.sql` — administrator allow-list, `auth.users` sync trigger,
     email lock (apply after fulfilment; it replaces `is_admin()`)
4. `setup-security-hardening.sql` — hardening, delete-my-data, tightening
5. `setup-promo-codes.sql` — promotions
6. `setup-product-details.sql` — description/material/features
7. `setup-product-images.sql` — storage bucket + policies
8. `setup-admin-bootstrap.sql` — admin role trigger
9. `setup-email-dispatch.sql` — Brevo sender identity, `dispatch_emails()`,
   `pg_cron` job `fx-email-dispatch`, welcome-email trigger, `email_enabled='true'`

All files are written to be re-runnable (`IF NOT EXISTS`, `CREATE OR REPLACE`,
idempotent policy drops). Re-applying them to a populated database is the supported
way to move a fix forward.

### 4.1 Rules for a new migration

1. New file `setup-<topic>.sql`; never edit an applied file in a way that changes
   behaviour for existing rows.
2. Idempotent: `IF NOT EXISTS`, `OR REPLACE`, `DROP POLICY IF EXISTS` first.
3. Wrap multi-statement changes in `BEGIN; … COMMIT;`.
4. Enable RLS + policies in the same file as the table.
5. Add the new RPC to `08-api.md` and the table to this document in the same commit.
6. Apply to production, then verify with `db.js query`.

### 4.2 Rollback

There is no automated down-migration. Rollback = restore the last logical backup
(`16-operations.md` §3) or write a compensating SQL file. Destructive changes
(drop column) must be preceded by a backup.

## 5. Stock model

- `stock` = physical units available.
- `reserved_stock` = units held by open orders.
- Sellable = `stock - reserved_stock`.
- `create_order` locks the product row, re-checks sellable, increments
  `reserved_stock`; cancellation decrements it; delivery decrements `stock` and
  `reserved_stock` together (fulfilment RPC).
- The shop display uses `stock` and marks sold out at `stock - reserved_stock <= 0`.

## 6. Backup

See `16-operations.md` §2 and `BACKUP_RESTORE.md`. Daily Supabase automated
backups depend on the plan; the repository's own procedure is `pg_dump` via
`_private-tools`.

## 7. Data retention

- Orders and order items: retained (financial record).
- Reviews, addresses, returns: deleted when the customer deletes their account
  (`delete_my_data`).
- `audit_log`: retained; contains actor email, no passwords.
- `rate_limit_hits`: pruned by the rate-limit helper (rolling window).
- Wipe performed 2026-10-29: all auth users, `public.users`, orders, sessions,
  addresses, reviews, returns, password resets, notifications and audit rows were
  cleared; catalogue, settings and promo codes kept.
