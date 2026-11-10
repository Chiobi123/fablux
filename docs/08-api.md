# 08 — API Specification and Reference

**Status:** current · last reviewed 2026-11-10
All calls originate in `js/api-client.js`. There is no server of our own; the "API"
is the Supabase project.

- Base: `https://msisbmcowtggbvasubla.supabase.co`
- REST: `/rest/v1` · RPC: `/rest/v1/rpc/<fn>` · Auth: `/auth/v1`
- Headers: `apikey: <publishable key>` and `Authorization: Bearer <user JWT | publishable key>`
- Content type: `application/json`
- Errors: `{ "message"|"msg"|"error_description": string, "code"?: string }`

---

## 1. Authentication endpoints (Supabase Auth)

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/v1/signup` | `{email, password, data:{name, phone}}` | `{access_token?, user}` |
| POST | `/auth/v1/token?grant_type=password` | `{email, password}` | `{access_token, refresh_token, user}` |
| POST | `/auth/v1/recover` | `{email, redirect_to}` | `{}` (email sent) |
| PUT | `/auth/v1/user` | `{password}` (Bearer JWT) | user |
| GET | `/auth/v1/user` | — | current user |
| POST | `/auth/v1/logout` | — | `{}` |
| GET | `/auth/v1/authorize?provider=google&redirect_to=…` | — | 302 to Google, or 400 if the provider is disabled |

The client stores only `access_token` (`fablux_api_token_v1`) and a small user cache
(`fablux_api_user_v1`). Refresh tokens are not persisted; an expired session asks
the user to sign in again.

## 2. RPCs

All are `POST /rest/v1/rpc/<name>` with a JSON body. `SECURITY DEFINER` functions
set `search_path` and re-check the caller.

### 2.1 `create_order`

```json
{
  "p_items": [{"product_id": "p1", "quantity": 2}],
  "p_name": "Ada Obi",
  "p_phone": "0803…",
  "p_address": "12 Marina",
  "p_city": "Lagos",
  "p_state": "Lagos",
  "p_delivery_method": "standard",
  "p_payment_method": "pay-on-delivery",
  "p_guest_email": "ada@example.com",
  "p_landmark": "…",
  "p_instructions": "…",
  "p_promo": "WELCOME10",
  "p_idempotency_key": "uuid"
}
```

`p_guest_email` is used only when nobody is signed in; `p_promo` is the raw code, not
a price. Everything else in the body that looks like money or identity is ignored —
the function reads the customer from `auth.uid()`.

Returns
`{ order_id, reference, tracking_token, status, payment_status, subtotal, delivery_fee, discount, promo_code, total, currency, created_at, duplicate }`.

Guarantees: re-prices from `products`, rejects insufficient stock, ignores any
client-supplied price, is idempotent on `p_idempotency_key` (returns the first order
with `duplicate: true`), **decrements `products.stock`** inside the same transaction,
writes `order_events`, queues the notification rows, writes `audit_log`.

Stock is not returned if the order is later cancelled — `reserved_stock` exists but
nothing writes it (`01` §14).

Errors: `not authenticated` (signed-in path only), `Not enough stock for "…"`,
`That promo code is not valid.`, `Order not found.`

### 2.2 `track_order`

`{ "p_ref": "FX-…", "p_token": "<tracking_token>" }` → `{ order, items, events }`.
A wrong token returns no row. No authentication required.

### 2.3 `validate_promo`

`{ "p_code": "WELCOME10", "p_subtotal": 45000 }` →
`{ valid: true, code, kind, value, discount, message }`, or
`{ valid: false, message }` with a readable reason. It never raises; the caller
decides. `create_order` calls it again with its own subtotal, so a tampered client
cannot invent a discount.

### 2.4 Public forms

| RPC | Body | Notes |
|---|---|---|
| `submit_contact` | `p_name, p_email, p_subject, p_message, p_consent, p_honeypot, p_user_agent` | rate limited; honeypot must be empty; consent required |
| `subscribe_newsletter` | `p_email, p_consent, p_honeypot` | idempotent on email |
| `unsubscribe_newsletter` | `p_email` | removes the row |

### 2.5 Account

| RPC | Body | Notes |
|---|---|---|
| `delete_my_data` | `{}` | deletes addresses, reviews, returns and the `public.users` row for `auth.uid()`; orders are retained for financial records |

### 2.6 Payments (service role only)

| Function | Body | Notes |
|---|---|---|
| `confirm_payment` | `{p_reference, p_amount, p_provider_status}` | idempotent; rejects an amount that differs from the stored kobo amount; flips the order to `payment_confirmed` + `successful`, writes an event, an audit row and the notification outbox rows |
| `expire_stale_payments` | `{}` | marks `pending` attempts past `expires_at` as `abandoned`; returns the count |

Neither is executable by `anon` or `authenticated`; only `service_role`.

The browser never calls them. `verifyPaystack(reference)` and
`paystackInitialize(reference, token)` go to the Edge Function instead:
`POST {BASE}/functions/v1/payments?action=verify|initialize`. The function is
written but **not deployed**, so `paystackEnabled()` is false and the card option
is not rendered (`23-integrations.md` §2).

### 2.7 Admin (all call `assert_admin()`)

| RPC | Body |
|---|---|
| `admin_set_order_status` | `{p_ref, p_new_status}` — refuses a transition outside the table in `24-workflows.md` §5 |
| `admin_set_payment_status` | `{p_ref, p_new_status}` — refuses to mark a `paystack` order paid; only the gateway may |
| `admin_set_courier` | `{p_ref, p_courier, p_tracking, p_dispatched_at, p_notes}` |
| `admin_update_setting` | `{p_key, p_value}` — key must be one of `delivery_fee_default`, `delivery_fee_express_surcharge`, `store_name`, `store_contact`, `store_email`, `store_address`, `email_enabled`; delivery values must be 1–7 digits |

Return status is **not** an RPC: `adminReturnStatus(id, status)` validates the value
against `requested | approved | rejected | received | refunded` in JS and then
`PATCH /returns?id=eq.<id>`, which RLS allows for admins only.

## 3. REST resources used

| Resource | Method / query | Auth |
|---|---|---|
| `/products` | `GET ?select=…&active=eq.1&order=created_at.desc` | anon key |
| `/products` | `GET ?id=eq.…&active=eq.1` | anon key |
| `/products` | `POST` / `PATCH` / `DELETE` | admin JWT + RLS |
| `/reviews` | `GET ?product_id=eq.…&status=eq.published` | anon |
| `/reviews` | `POST` | own JWT |
| `/addresses` | `GET/POST/DELETE ?user_id=eq.<own>` | own JWT |
| `/orders` | `GET ?select=*,order_items(*)&user_id=eq.<own>` | own JWT |
| `/returns` | `POST` | own JWT |
| `/settings` | `GET ?key=in.(…)` | anon (public keys only) |
| `/users` | `POST` on sign-up, `GET ?select=role&id=eq.<own>` | own JWT |

Admin screens read `/orders`, `/users`, `/returns`, `/notifications`, `/audit_log`,
`/promo_codes`, `/products` directly — RLS decides what is visible.

## 4. Storage

- Bucket `product-images` (public read).
- Upload: `POST /storage/v1/object/product-images/<path>` with the admin JWT.
- Public URL: `/storage/v1/object/public/product-images/<path>`.
- Write policies restrict to admins; delete is admin-only.

## 5. Error handling contract

`api-client.js` wraps every call:

1. `netFetch` retries network failures 3× with 350/1000 ms backoff.
2. HTTP errors are converted to `Error` with `.status`.
3. `friendly()` maps `Failed to fetch`, timeouts and 5xx to a readable sentence.
4. UI surfaces the message via toast or inline text; no stack traces.

Status codes the UI reacts to:

| Status | Meaning | UI |
|---|---|---|
| 401 | missing/expired JWT | prompt sign-in, keep cart |
| 403 | RLS denied | "You do not have access to that." |
| 404 | row not found | empty state |
| 409 | unique violation (duplicate email, reuse of key) | specific message |
| 429 | rate limited | "Too many attempts, try again shortly." |
| 5xx | platform error | retry message |

## 6. Versioning

No version prefix. The database is the contract: changing an RPC signature requires
updating `js/api-client.js` and this document in the same commit, and keeping the
old signature until the deployed client is replaced.

## 7. Rate limits (enforced in SQL)

| Bucket | Subject | Limit |
|---|---|---|
| `contact` | email | 5 per hour |
| `newsletter` | email | 3 per hour |
| `unsubscribe` | email | 5 per hour |

Only these three buckets exist in `setup-security-hardening.sql`. Reviews and return
requests are **not** rate-limited; they are gated by sign-in and row ownership
instead. Change numbers in SQL, not in JS.

## 8. Example: catalogue read

```bash
curl "https://msisbmcowtggbvasubla.supabase.co/rest/v1/products?select=id,name,price,category,image,stock&active=eq.1&order=created_at.desc" \
  -H "apikey: sb_publishable_…" \
  -H "Authorization: Bearer sb_publishable_…"
```

Returns an array of product rows. Prices are integers in naira.
