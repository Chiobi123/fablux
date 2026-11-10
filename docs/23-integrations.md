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
| Google OAuth | social sign-in | browser → Google → Supabase | client id/secret in Supabase | **live** (verified 2026-10-30) |
| Email provider (Brevo) | order alerts, welcome mail, contact enquiries, password resets | site/DB → Brevo API; Supabase Auth → Brevo SMTP | API key in Supabase Vault; SMTP key in Supabase auth config | **live** (2026-10-31) |
| Payment processor | card payments | none | — | **not used** |

## 2. Payments

**Status:** gateway code written, **not deployed** — waiting on a Supabase access
token (to deploy the function) and the Paystack secret key. Until then the card
option is hidden in checkout and the store runs on the two manual methods.

### 2.1 Methods

| Method | `orders.payment_method` | Money moves | When live |
|---|---|---|---|
| Pay on delivery | `pay-on-delivery` | cash/transfer on handover | now |
| Bank transfer | `bank-transfer` | customer transfers, owner confirms | now |
| Paystack | `paystack` | card/transfer at the gateway, settled by webhook | after deploy + keys |

`orders_payment_method_check` rejects anything else, so a dead "card" option can
no longer create an unpayable order. No card data touches the site: the customer
pays on Paystack's hosted page (SAQ A, no cardholder data environment).

### 2.2 Gateway flow

1. Checkout calls `create_order` (database computes prices) and receives the order
   reference and tracking token.
2. `POST /functions/v1/payments?action=initialize` with `{reference, token}`:
   the function proves the caller holds the order, reads the total **from the
   database**, creates a Paystack transaction (`amount = total × 100` kobo) and
   inserts a `payment_transactions` row (`pending`, 30-minute expiry).
3. The browser is redirected to `authorization_url`. It never sees the secret key.
4. Paystack calls `?action=webhook`: HMAC-SHA512 of the raw body is compared with
   `x-paystack-signature`; `charge.success` is re-verified with
   `GET /transaction/verify/:reference`, then `confirm_payment` settles the
   transaction and the order.
5. `payment-callback.html` calls `?action=verify&reference=…` for the customer's
   screen. The callback is a convenience only; the webhook is authoritative.

### 2.3 Safety rules

- Settlement is idempotent: a replayed webhook returns `already: true` and writes
  nothing (`confirm_payment` locks the row).
- Amount mismatch raises and leaves the order untouched.
- `admin_set_payment_status` refuses to mark a `paystack` order paid.
- One live attempt per order; expired attempts are marked `abandoned` by
  `expire_stale_payments` before a retry.
- Manual refunds in the Paystack dashboard, recorded in the order notes (no refund
  API yet — accepted at this size).

### 2.4 Deploying it (owner)

```
supabase login                                  # or SUPABASE_ACCESS_TOKEN in the env
supabase functions deploy payments --no-verify-jwt --project-ref msisbmcowtggbvasubla
supabase secrets set PAYSTACK_SECRET_KEY=sk_live_… SITE_URL=https://fablux.pages.dev
```

Add the webhook in Paystack → Settings → API Keys & Webhooks:
`https://msisbmcowtggbvasubla.supabase.co/functions/v1/payments?action=webhook`.

Then flip `PAYSTACK_ENABLED` to `true` in `js/api-client.js` (one line), bump the
asset token and redeploy the site. Test with `sk_test_…` first (card
4084 0840 8408 4081, CVV 408, PIN 0000, OTP 123456).

## 3. Google Translate

- Loaded on demand the first time a visitor picks a language (or on load when one is
  already saved); English pages never fetch it.
- The chosen language is applied in place: `site-tools.js` sets the widget's hidden
  `.goog-te-combo` value and dispatches a bubbling `change`. No reload, no cover, and
  the previous language never reappears in between.
- `googtrans=/en/<code>` is still written, so a newly opened page starts in the saved
  language. Choosing English deletes the cookie and restores the original text.
- If the widget never populates its select, `site-tools.js` re-creates it once (~10 s)
  and then gives up quietly, leaving the page in English.
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

## 6. Email

**Status:** live (2026-10-31). Brevo relay; sender `FabluX.U.Design
<igbanichiobiebere@gmail.com>` (verified). Auth mail goes through Supabase's SMTP
client on port **465**; app mail goes through Brevo's HTTP API from Postgres.

### 6.1 Auth mail (password reset) — live

- Supabase → Authentication → Emails → SMTP: `smtp-relay.brevo.com`, port **465**,
  user `c0cb48001@smtp-brevo.com`, password = the Brevo SMTP key.
- The From address must be a **verified** Brevo sender or every send is rejected.
- Port 587/STARTTLS did not deliver; 465/SMTPS is the working setting.
- `rate_limit_email_sent` is 100/hour.

### 6.2 Order and welcome mail — `setup-email-dispatch.sql`

`queue_notification()` writes rows into `public.notifications`. The sender added on
2026-10-31 delivers them with no server:

1. `public.dispatch_emails(20)` takes `status='queued'` rows, posts them to
   `https://api.brevo.com/v3/smtp/email`, then marks them `sent`.
2. `pg_cron` job `fx-email-dispatch` runs it every minute.
3. `trg_welcome_email` on `public.users` queues a welcome message for each new
   customer (OAuth included, because `trg_sync_auth_user` creates the row).
4. Sender identity lives in `public.email_settings` (RLS on, no policy).
5. The Brevo **API key** lives in Supabase Vault as `brevo_api_key` — not in git, and
   unreadable with the anon key (verified: `[]`).

`settings.email_enabled='true'` is set, so new order events queue immediately.

**Ceiling:** a row is marked `sent` when Brevo accepts the request, not when the mail
lands. `net._http_response` holds the real status for 6 hours; add a verification
pass if bounce handling is ever needed. Senders are free-provider addresses, so some
spam placement is expected until a domain is authenticated.

### 6.3 Where replies go

Every send carries an explicit `replyTo`, so the destination is never a guess:

| Mail | Reply lands at |
|---|---|
| Welcome, order received, status updates, payment | `email_settings.reply_to`, falling back to `from_email` — today `igbanichiobiebere@gmail.com` |
| Contact-page enquiry alert (to the three admins) | the **customer's own address** (`notifications.reply_to`), so Replying answers them |
| Password reset | `igbanichiobiebere@gmail.com` (Supabase SMTP sender; there is no template reply-to) |

Change the customer-facing reply address with:

```sql
update public.email_settings set reply_to = 'support@yourdomain.com' where id = 1;
```

`from_email` can stay on a verified sender while `reply_to` moves to a real support
mailbox — that is the point of the split. Set `reply_to` **before** switching
`from_email` to a no-reply address, or customer replies will vanish.

Contact enquiries: `submit_contact()` only inserted into `public.contacts`, which
nothing read, so an enquiry could sit unseen. `trg_contact_alert` (same file) now
queues one mail per administrator with the customer's address as reply-to. The row
is still stored, so nothing is lost if mail fails.

**Open issue:** `settings.store_email` is `info@fabluxudesign.com`, and the contact
page links to it, but that domain and mailbox are not verified or confirmed live.
Until they are, it is a dead address on a customer-facing page.

## 7. Integration failure behaviour

| Integration down | Effect | Mitigation |
|---|---|---|
| Supabase | no catalogue/checkout; static content still serves | status page, retry, manual orders |
| Google Translate | English only after 10 s + notice | switch to English |
| Google Fonts | system font fallback | none needed |
| Font Awesome | icons missing | none needed |
| Google OAuth | button explains; email sign-in works | probe fails open: a dead probe still sends the visitor to Google |
| Email | resets and alerts not delivered | auth sends through Brevo port 465; outbox retries via `dispatch_emails()` |

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
