# 08 — API Specification and Reference

**Status:** current · last reviewed 2026-10-29
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
  "p_email": "ada@example.com",
  "p_landmark": "…",
  "p_instructions": "…",
  "p_promo_code": "WELCOME10",
  "p_idempotency_key": "uuid"
}
```

Returns `{ id, reference, tracking_token, total, … }`.

Guarantees: re-prices from `products`, rejects insufficient stock, ignores any
client-supplied price, is idempotent on `p_idempotency_key`, reserves stock, writes
`order_events`, queues a notification, writes `audit_log`.

Errors: `not authenticated`, `out of stock`, `invalid promo code`,
`product not found`.

### 2.2 `track_order`

`{ "p_ref": "FX-…", "p_token": "<tracking_token>" }` → `{ order, items, events }`.
A wrong token returns no row. No authentication required.

### 2.3 `validate_promo`

`{ "p_code": "WELCOME10", "p_subtotal": 45000 }` →
`{ code, kind, value, discount, min_subtotal }` or an error.

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

### 2.6 Admin (all call `assert_admin()`)

| RPC | Body |
|---|---|
| `admin_set_order_status` | `{p_ref, p_new_status}` |
| `admin_set_payment_status` | `{p_ref, p_new_status}` |
| `admin_set_courier` | `{p_ref, p_courier, p_tracking, p_dispatched_at, p_notes}` |
| `admin_update_setting` | `{p_key, p_value}` |

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
| `contact` | email | 3 per hour |
| `newsletter` | email | 3 per hour |
| `review` | user id | 5 per hour |
| `return` | user id | 5 per hour |

Exact numbers live in `setup-security-hardening.sql`; change them there, not in JS.

## 8. Example: catalogue read

```bash
curl "https://msisbmcowtggbvasubla.supabase.co/rest/v1/products?select=id,name,price,category,image,stock&active=eq.1&order=created_at.desc" \
  -H "apikey: sb_publishable_…" \
  -H "Authorization: Bearer sb_publishable_…"
```

Returns an array of product rows. Prices are integers in naira.
