# 02 — Business Requirements Document (BRD)

**Business:** FabluX.U.Design — premium clothing, shoes and accessories
**Market:** Nigeria (NGN pricing, Nigerian states, pay-on-delivery and bank transfer)
**Status:** living · last reviewed 2026-10-29

---

## 1. Business objectives

1. Convert Instagram/WhatsApp interest into recorded orders.
2. Remove manual order-taking from the owner's day.
3. Build a customer list the business owns (accounts + newsletter), independent of
   a social platform.
4. Make the brand look credible enough to justify premium pricing: own domain,
   policies, tracking, real photography.

## 2. Revenue model

| Stream | Description | Implemented? |
|---|---|---|
| Product sales | Direct online orders, paid on delivery or by transfer | Yes |
| Delivery fees | `delivery_fee_default`, `delivery_fee_express_surcharge` in `settings` | Yes |
| Promotions | Percentage or fixed discounts via `promo_codes` + `validate_promo` | Yes |
| Advertising/affiliate | none | No |

No card acquiring is configured, so there is no payment-processor fee and no
PCI-DSS scope today (`23-integrations.md`).

## 3. Operating costs

| Cost | Basis | Notes |
|---|---|---|
| Domain | annual | `fablux.pages.dev` is the current host |
| Hosting | Cloudflare Pages free tier | static, no server to run |
| Database/Auth/Storage | Supabase plan | free tier until limits are reached |
| Email | none connected | `notifications` table acts as an outbox |
| Photography | per shoot | outstanding — see `19-support-and-releases.md` |

Costs are driven by the owner's actual plans; the code does not assume paid tiers.

## 4. Stakeholders

| Role | Responsibility |
|---|---|
| Owner/operator | catalogue, pricing, fulfilment, support, admin console |
| Developer/maintainer | code, schema, deploys, documentation |
| Customer | places orders, tracks, requests returns |
| Supabase / Cloudflare | infrastructure providers |

## 5. Business rules (enforced in the database)

1. A product cannot be sold below zero stock. `create_order` reserves stock and
   releases it only on cancellation, never on failure.
2. A price shown at checkout is the price stored in `products` at the moment of
   order creation; the client cannot send its own price.
3. Only the two approved addresses may hold the `admin` role:
   `ujunwaivbani@gmail.com`, `igbanichiobievere@gmail.com` (`allowed_admin_email()`).
4. Orders may be cancelled before dispatch; refunds are recorded in
   `payment_transactions` when a processor is added.
5. A return request is accepted only against the customer's own order
   (`returns_own` policy).
6. Reviews are published immediately (`status = 'published'`) and can be removed by
   an admin.

## 6. Constraints

- Single operator: every process must be runnable by one person in a browser.
- No 24/7 on-call: the system must degrade rather than page anyone.
- Budget: free tiers where possible.
- Legal: Nigerian Consumer Protection Act expectations (clear pricing, delivery
  terms, returns window published in `refund-policy.html`).

## 7. Success measures

| Measure | Source | Cadence |
|---|---|---|
| Orders per week | `orders.created_at` | weekly |
| Average order value | `orders.total` | weekly |
| Cancellation/return rate | `orders.status`, `returns` | monthly |
| Stock-outs | `products.stock = 0` | weekly |
| Newsletter growth | `newsletter_subscribers` | monthly |
| Support contacts per 100 orders | `contacts` | monthly |

No historic values exist yet; these are the measures to start collecting after
launch.

## 8. Business risks

| Risk | Mitigation |
|---|---|
| Chargebacks / fake orders with pay-on-delivery | phone confirmation before dispatch (manual) |
| Stock oversell | reservation inside `create_order` |
| Owner unavailable | admin console is role-based; a second approved email exists |
| Platform dependency (Supabase) | logical backups (`BACKUP_RESTORE.md`) |
| Translation misstates policy terms | English text is authoritative; policies are linked in the footer of every page |
