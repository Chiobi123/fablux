# 23 — Integrations and Payment Verification

**Status:** current · last reviewed 2026-10-29

---

## 1. Integration inventory

| Integration | Purpose | Direction | Auth | Status |
|---|---|---|---|---|
| Supabase Postgres | system of record | site → DB | RLS + JWT | live |
| Supabase Auth | identity | site → auth | publishable key | live |
| Supabase Storage | product images | site → bucket | admin JWT for writes | live |
| Google Translate | language switching | browser → Google | none | live, optional |
| Google Fonts | typography | browser → Google | none | live |
| Font Awesome (cdnjs) | icons | browser → cdnjs | none | live |
| Cloudflare Pages | hosting + headers | — | account | live |
| Google OAuth | social sign-in | browser → Google → Supabase | client id/secret in Supabase | **disabled** |
| Email provider | order alerts / resets | none | — | **not connected** |
| Payment processor | card payments | none | — | **not used** |

## 2. Payments — what exists and how it is verified

### 2.1 Methods

| Method | Value in `orders.payment_method` | Money moves |
|---|---|---|
| Pay on delivery | `pay-on-delivery` | cash/transfer to the courier or on handover |
| Bank transfer | `bank-transfer` | customer transfers, owner confirms manually |

No card data is collected, transmitted or stored. There is therefore **no PCI-DSS
scope** today: no cardholder data environment exists.

### 2.2 Flow

1. Checkout records the order with `payment_status = 'pending'`.
2. The owner confirms the transfer in the bank app.
3. The owner sets payment status to `successful` in the admin console
   (`admin_set_payment_status`), which writes an `order_event` and an `audit_log` row.
4. Delivery proceeds; the order is marked `delivered`.

`payment_transactions` exists for a future processor: `provider`, `reference`
(unique), `amount`, `currency`, `status`, `provider_status`, `expires_at`,
`verified_at`. Nothing writes to it yet.

### 2.3 Verification rules

- Never mark `successful` from a customer's screenshot alone; confirm in the bank.
- Match the **amount** and the **reference** (the order reference is the narration).
- Partial payments keep the order `pending`; note the shortfall in `orders.notes`.
- Refunds are manual and recorded in the order's notes until a processor is added.
- `payment-callback.html` exists for a future processor callback; it must not be
  trusted without a signature check when that integration is built.

### 2.4 Adding a processor later (outline)

1. Choose a provider that supports NGN (e.g. Paystack/Flutterwave).
2. Server-side only: a Supabase Edge Function creates the transaction and verifies the
   webhook signature. The browser must never hold the secret key.
3. Insert into `payment_transactions`; update `orders.payment_status` from the verified
   webhook, not from the redirect.
4. Add the provider origin to CSP `connect-src`/`frame-src`.
5. Update this document, `21-legal.md`, and the refund policy.
6. Re-assess PCI scope with the provider's hosted checkout (SAQ A typically).

## 3. Google Translate

- Loaded only when `localStorage.fablux_lang` is not `en`.
- Target language is applied with the `googtrans=/en/<code>` cookie **before** the page
  loads; the widget is not patched after the fact (that did not work reliably).
- A cover prevents an English flash; it is removed when `<font>` elements appear or
  after 10 s, with a notice on failure.
- The switcher UI is marked `translate="no"` so it is never translated.
- CSP allows `translate.google.com`, `translate.googleapis.com`,
  `translate-pa.googleapis.com`.
- Page text is sent to Google when a translation is active. The cookie policy says so.
- Legal pages translated by machine are convenience copies; English governs.

## 4. Supabase

- URL and publishable key are public by design.
- Service-role key only in `_private-tools/.env`.
- RLS on all tables; `SECURITY DEFINER` functions pin `search_path`.
- Auth redirect URLs must be allow-listed for the production domain.
- Storage bucket `product-images`: public read, admin write.
- Backups: see `16-operations.md` §2.

## 5. Cloudflare Pages

- Serves `dist/` (or the repo root with `node build.js`).
- Applies `_headers` (CSP, HSTS, cache).
- Rollback via the deployments list.
- No Functions/Workers are deployed.

## 6. Email (outbox, not a sender)

`queue_notification()` writes rows to `notifications` on order events. With
`settings.email_enabled = 'false'` nothing is sent. The admin console says so.

To connect a provider:

1. Create a Supabase Edge Function (or Cloudflare Worker) with the provider's API key.
2. Select `notifications` where `status='pending'`, send, set `sent_at` / `status`.
3. Add retry handling and increment `attempts`; store `error` on failure.
4. Set `email_enabled = 'true'` only when delivery is verified.
5. Also configure Supabase Auth SMTP so password-reset mail is reliable.

## 7. Integration failure behaviour

| Integration down | Effect | Mitigation |
|---|---|---|
| Supabase | no catalogue/checkout; static content still serves | status page, retry, manual orders |
| Google Translate | English only after 10 s + notice | switch to English |
| Google Fonts | system font fallback | none needed |
| Font Awesome | icons missing | none needed |
| Google OAuth | button explains; email sign-in works | — |
| Email | resets and alerts not delivered | admin resets via Supabase dashboard |

## 8. Third-party data sharing summary

| Recipient | Data | When |
|---|---|---|
| Supabase | all account/order data | always |
| Cloudflare | request metadata, IP | always |
| Google (Translate) | page text, IP, cookies | only when a non-English language is chosen |
| Google (Fonts) | IP, user agent | always (font request) |
| cdnjs | IP, user agent | always (icon CSS) |
| Payment provider | none today | — |

This table must match `21-legal.md` §4 and the privacy page.
