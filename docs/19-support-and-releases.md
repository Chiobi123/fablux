# 19 — Support, Known Issues, Changelog and Release Notes

**Status:** current · last reviewed 2026-10-29

---

## 1. Customer support and troubleshooting

### 1.1 First response checklist

1. Ask for the order reference (or the email used at checkout).
2. Look the order up in `/admin.html` (search by reference/email/phone).
3. Check `order_events` for what actually happened.
4. Reply with the specific status and next step — do not promise a date the courier
   has not given.

### 1.2 Symptom → cause → fix

| Symptom | Likely cause | Fix |
|---|---|---|
| "Order not found" on tracking | wrong token, or order was created under a different reference | resend the confirmation link; look up in admin |
| Checkout says out of stock | stock/reserved changed after adding to bag | confirm current stock; offer alternative or refund |
| "Network problem" | offline, Supabase incident, or blocked request | retry; check status pages; check `error-log.js` |
| Cannot sign in | wrong password, unconfirmed email, expired session | reset password; confirm email in Supabase |
| Reset email never arrives | SMTP limits / spam | check spam; resend; reset from Supabase dashboard |
| Google button says "not enabled" | provider disabled in Supabase | expected until enabled (`09-auth.md` §6) |
| Page in the wrong language | saved language/cookie | switch to English with the globe pill; clear cookies |
| Theme stuck | saved preference | toggle; clear `fablux_theme` |
| Images missing | bucket/file problem | re-upload; check the public URL |
| Admin page blank | account lacks role | check `public.users.role` |
| "Translation is unavailable" | Google blocked/offline | expected fallback; English is shown |

### 1.3 Information to collect

- Page URL, device/browser, approximate time.
- Order reference.
- For JS errors: open the console and run `FabluXErrors.list()` — the last 20 errors
  are stored locally (no data leaves the browser).
- A screenshot of the exact message.

## 2. Known issues and bug log

| ID | Issue | Severity | Status |
|---|---|---|---|
| K-01 | Google OAuth provider disabled in Supabase; button explains it | Medium | Open — owner action (`09-auth.md` §6) |
| K-02 | No outbound email; order alerts stay in the outbox | Medium | Open — provider needed |
| K-03 | `images/logo.jpg` is 0 bytes; product photography incomplete | Medium | Open — owner assets |
| K-04 | Store contact/address settings empty | Medium | Open — owner fills in admin |
| K-05 | No automated tests; regressions caught manually | Medium | Accepted (TD-06) |
| K-06 | CSP allows `'unsafe-inline'` | Low | Accepted (TD-03) |
| K-07 | `delete_my_data` leaves the `auth.users` row | Low | Accepted (TD-05) |
| K-08 | Legacy unused tables/columns | Low | Accepted (TD-01) |
| K-09 | Admin order list filters client-side; slow at thousands of orders | Low | Accepted at current volume |
| K-10 | Machine translation may mangle the brand name in `<title>` | Low | Accepted |
| K-11 | Language switch depends on `translate.google.com`; blocked networks fall back to English | Low | Mitigated with notice |
| K-12 | No staging project; SQL tested in production | Medium | Accepted (TD-10) |
| K-13 | No MFA on admin accounts | Medium | Open — platform capability |
| K-14 | Publishable key is hard-coded (rotation needs a redeploy) | Low | Accepted |

Bug reports go to the repository owner with the §1.3 information.

## 3. Change log

Chronological, newest first. Conventional prefixes match the commit history.

### 2026-11-10

- `docs(prd)`: `01-product-requirements.md` rewritten against the shipped system.
  The 2026-10-29 draft described a product that no longer exists — two admins
  instead of three, six languages instead of 80, no mail provider, no guest
  checkout. Every capability now carries a status (live / built-not-active /
  partial / not built), the invariants that must not regress are listed in one
  place, and §14 is an ordered open-items register.
- `docs(workflows)`: added `24-workflows.md`. Fourteen processes are specified
  end to end — browse, checkout, order lifecycle, the four payment paths, courier
  and waybill, returns, reviews, contact/newsletter, the email outbox loop,
  auth and roles, the admin daily routine, build and release, backup, incident
  response — each with the database function that owns the decision and what
  happens when the step fails.
- `docs(plan)`: `22-project-plan.md` phases and timeline refreshed to 2026-11-10;
  remaining work now matches the PRD's open-items register.
- `docs(index)`: `README.md` map updated, stale "Google sign-in not enabled" and
  "email not connected" statements removed, `23-integrations.md` email row marked
  live.

### 2026-11-03

- `feat(admin-ui)`: the console is now a sidebar workspace instead of a 700 px
  card with a horizontal tab strip. Navigation is grouped (Main / Sales / Store /
  System), the sidebar shows the queued-mail count on Notifications, and every
  page opens with its own title, a one-line description and a date chip. The
  dashboard greets the signed-in administrator, shows four KPI cards (revenue and
  orders this month with the previous month's change, awaiting payment,
  customers) and keeps the 14-day chart, pipeline, recent orders and low stock.
  `#adminPage.pro-admin-card` is neutralised in `dashboard.css`, so the console
  uses the full content width. No new database call: the month-over-month deltas
  are computed from the orders already loaded.
- `feat(brand-hero)`: the home hero leads with the shop name. "Wear Luxury. Live
  Confidence." and the `PREMIUM FASHION STORE` eyebrow were removed because they
  pulled attention away from the wordmark; `FabluX` is set at up to 104 px in
  Playfair Display with `.U.Design` letter-spaced beneath it, and the overlay is
  a left-heavy wash so the name reads clearly while the photograph stays visible.
- `chore(assets)`: `?v=20261103a` on every HTML file after the CSS/JS change.

### 2026-10-31

- `feat(email)`: transactional mail is live through Brevo. Supabase auth mail uses
  the Brevo SMTP relay on port **465** (`smtp-relay.brevo.com`, sender
  `igbanichiobiebere@gmail.com`); port 587 did not deliver. `rate_limit_email_sent`
  is 100/hour and password resets were confirmed arriving.
- `feat(email-outbox)`: added `setup-email-dispatch.sql`. `dispatch_emails()` posts
  `notifications` rows with `status='queued'` to `https://api.brevo.com/v3/smtp/email`
  via `pg_net`; `pg_cron` runs it every minute as `fx-email-dispatch`.
  `trg_welcome_email` queues a welcome mail for every new `public.users` row.
  `settings.email_enabled` is now `'true'`.
- `feat(email-replies)`: every send now carries an explicit `replyTo`.
  `email_settings.reply_to` (default: the sender) receives customer replies;
  `trg_contact_alert` on `public.contacts` mails each enquiry to the three admins with
  the **customer's** address as reply-to, so Replying answers them. Previously
  `submit_contact()` wrote into `contacts` and nothing read it.
- `feat(email-security)`: the Brevo API key is stored in Supabase Vault as
  `brevo_api_key`. Sender identity is in `public.email_settings` with RLS and no
  policy; the anon key reads `[]`, and both `dispatch_emails` and `notifications`
  return 401 for anon.
- `ops(email)`: Brevo SMTP IP blocking was deactivated — it was enabled with zero
  authorised IPs, which would reject every Supabase send.

### 2026-10-30 (night)

- `fix(auth)`: an administrator signing in was treated as a customer. Google/OAuth
  created the auth account but never the `public.users` row that `is_admin()` reads.
  A trigger on `auth.users` now provisions the row for every sign-up (OAuth and
  password), and the client repairs a missing row as a fallback.
- `fix(security)`: closed a privilege escalation. `is_admin()` trusted
  `public.users.email`, which a signed-in customer can edit; pointing that email at
  an allow-listed address granted admin. The check now also compares against
  `auth.jwt()->>'email'`, and `lock_user_email` reverts any email that is not the
  Auth-owned address. Verified live: the PATCH left the row unchanged.
- `feat(admin-emails)`: allow-list is now `fabluxdesigns@gmail.com`,
  `ujuigbani@gmail.com`, `igbanichiobiebere@gmail.com`; `ujunwaigbani@gmail.com` was
  demoted to customer. Applied with `setup-admin-emails.sql`.
- `fix(account)`: `.fx-nav a` sets `display:flex`, which beat the `[hidden]` rule, so
  every customer saw the **Admin console** link. Hidden is now `display:none` and
  verified: customers get no link, admins do.
- `fix(admin)`: a signed-in customer opening `admin.html` is returned to their
  account page instead of being shown an "administrators only" panel. Waybill no
  longer links back to the console.
- `fix(auth)`: after Google sign-in the visitor stayed on the login page. Signed-in
  visitors on `login.html`/`register.html` are now sent to the account or admin page;
  the `return` parameter only accepts same-folder `.html` pages.
- `feat(admin)`: Overview carries an "Adding products" card with a **Go to Products**
  button; the product form states the picture rules (square 1:1, JPG/PNG/WebP,
  800×800 px+, plain background).
- `refactor(hero)`: removed the hard-coded two-slide carousel; the hero uses one
  static photograph (ADR-15).
- `chore(security)`: stray signup `chiobiebereigbani@gmail.com` deleted and all
  sessions/refresh tokens revoked, so every account signs in again with the new roles.

### 2026-10-30 (evening)

- `fix(account)`: light mode made account links white on white cards until hover
  (`#accountPage .pro-card-link` overrode the background but not the colour). The
  account page no longer uses those classes.
- `feat(account)`: account page rebuilt as a hub — profile card, section nav
  (Overview, Delivery addresses, Account settings, Help & support) and a named
  address book with add/remove. Overview shows four counters and the three latest
  orders.
- `feat(admin)`: new **Overview** tab — revenue, average order, payment and packing
  queues, 14-day sales chart, orders by stage, recent orders, low stock.
- `feat(ui)`: `css/dashboard.css` with local `--fx-*` tokens for both themes; new
  components measure 6.9:1 contrast or better in light and dark (ADR-14).
- `fix(lang)`: the switcher no longer waits 20 s. The widget preloads on menu
  intent, a pick applies in place when ready, and otherwise reloads once after
  2.5 s with the cookie already set. Pages opened in a saved language load the
  widget immediately. Verified locally: pick → widget script present, select set to
  the chosen code, no reload, no `aria-busy` left behind.
- `docs`: 05 (components, language), 17 (account sections), 18 (admin overview),
  12 (ADR-14), 19.

### 2026-10-30 (later)

- `feat(auth)`: Google sign-in enabled on the Supabase project (provider on, client ID
  and secret stored in Supabase, redirect allow-list extended with the local preview
  origin). Verified: `/authorize?provider=google` now returns a 302 with
  `redirect_uri=https://msisbmcowtggbvasubla.supabase.co/auth/v1/callback`.
- `fix(auth)`: the availability probe fails open, so a blocked probe can no longer
  stop a working sign-in.
- `docs`: 09-auth §6 rewritten from blocked to enabled; 13 adds T-27.

### 2026-10-30

- `feat(payments)`: Paystack settlement layer — `payments` Edge Function
  (initialize / webhook / verify), `confirm_payment` and `expire_stale_payments`
  SQL, kobo amount checks, replay protection. **Not deployed**: needs a Supabase
  access token and `PAYSTACK_SECRET_KEY`.
- `fix(checkout)`: `orders_payment_method_check` now allows only
  `pay-on-delivery`, `bank-transfer` and `paystack`, so the dead "card (backend
  required)" option can no longer create an unpayable order.
- `fix(admin)`: manual payment confirmation is refused for gateway orders.
- `docs`: payments, database, API, legal and deploy docs follow the new layer.

### 2026-10-29

- `feat(site)`: 79-language switcher (native names), theme toggle, reading-progress
  ring; injected into all 28 pages.
- `fix(site)`: language changes now happen in place — the switcher drives Google's
  hidden `select` (bubbling `change`) instead of reloading. No loading cover, no
  English flash, no drift to a language that was not picked; the cookie is still
  written for the next page.
- `fix(site)`: light-mode hero wash is lilac and left-weighted, so the photograph
  stays visible instead of being whitened out.
- `fix(site)`: the hero starts below the fixed header, so the model's face is no
  longer covered by the navigation.
- `fix(auth)`: Google button probes the provider and explains "not enabled" instead
  of navigating to a JSON error; OAuth error params are surfaced on return.
- `fix(site)`: header height measured into `--header-h` so page tops are never
  hidden when the nav wraps.
- `fix(a11y)`: password eye toggle placed beside the field.
- `fix(mobile)`: Google button visible on auth pages above the mobile dock.
- `chore(security)`: CSP extended to Google Translate hosts.
- `chore(data)`: signed-in accounts, orders, sessions and logs cleared at the owner's
  request; catalogue, settings and promo codes kept.
- `docs`: full documentation set (this folder) covering the 62-item checklist.

### 2026-10-28

- `fix(security)`: escaped all untrusted data reaching `innerHTML` (stored XSS).
- `fix(security,a11y)`: DB-authoritative product details; removed the 18+ gate and the
  unused Express server; contrast fixes.
- `feat(security)`: RLS lockdown, rate-limited forms, consent banner, legal pages,
  accessible deploy build.
- `fix`: shop search, sort and product clicks respond to live catalogue cards.

### 2026-10-27

- Admin console dock (up/back/home), always-visible horizontal menu, concise home,
  lighter hero images.
- Structural skeleton loader and persistent back/home dock.
- Phone shop grid; public admin entry removed; marketplace removed; compact mobile
  buttons.

Earlier history: `git log --oneline`.

## 4. Release notes (user-facing)

### Release 2026-11-03 — "FabluX, front and centre"

- The home page now opens with the FabluX name in large type over the hero
  photograph. The old slogan is gone, so the brand is the first thing you read.
- The admin console has a proper sidebar and a dashboard with the numbers that
  matter today: this month's revenue and orders (compared with last month),
  orders waiting for payment, and how many customers are registered.

### Release 2026-10-31 — "Email works"

- Password-reset and account mail now arrive through Brevo instead of the throttled
  default sender.
- New customers get a welcome email automatically.
- Order updates (confirmed, packed, delivered) are emailed from the same outbox, so
  nothing sits waiting for someone to press send.
- Reply to any of those messages and it reaches our support inbox; messages from the
  contact page reach the team by email, and replying to one answers the customer
  straight away.

### Release 2026-10-30b — "Admin access fixed"

- Administrators now sign in and land in the console — Google sign-in included.
- The **Admin console** link is gone for customers; they only ever see their own
  account.
- Adding a product now explains what picture to upload (square, 800×800 px or more).
- The homepage opens on one clean photograph instead of a rotating pair.

### Release 2026-10-30 — "Clear account, real dashboard"

- Your account now has a proper menu: Overview, Delivery addresses, Account
  settings and Help, with your address book in plain sight.
- Text and buttons are readable in light mode again — no more white-on-white.
- The admin console opens on a dashboard: sales trend, order pipeline, recent
  orders and stock alerts.
- Changing language no longer takes half a minute, and you never have to refresh
  by hand.

### Release 2026-10-29 — "Language and comfort"

- **New:** pick from 79 languages; switching is instant and never reloads the page.
- **New:** light mode for daytime reading, with the hero photograph still visible
  behind a soft lilac wash.
- **New:** reading-progress ring that returns you to the top.
- **Fixed:** the home hero now starts below the navigation, so the model's face is
  fully visible.
- **Fixed:** the password field's eye button no longer covers the text you type.
- **Fixed:** the Google button is visible on phones.
- **Changed:** the Google button now tells you when Google sign-in is unavailable
  rather than showing an error page.
- **Changed:** navigation no longer overlaps page content when it wraps.

### Release 2026-10-28 — "Hardening"

- Security fixes for stored XSS, tighter database policies, rate limits, consent
  banner, policy pages, and an accessible deploy build.
- Product details now come from the database, so prices and stock are always current.
- Removed the 18+ gate and an unused server component.

## 5. Post-launch evaluation

Not applicable yet — the shop has not launched. When it does, record:

| Area | Metric | Target | Actual |
|---|---|---|---|
| Acquisition | sessions/week | — | — |
| Conversion | orders/sessions | — | — |
| Basket | average order value | — | — |
| Fulfilment | median time to dispatch | — | — |
| Support | contacts per 100 orders | — | — |
| Reliability | uptime | 99.5% | — |
| Quality | JS error rate per session | < 1% | — |

Review 30 days after the first paid order and update `01-product-requirements.md` if
the objectives change.

## 6. Version and release history

| Version | Date | Commit | Summary |
|---|---|---|---|
| 2026.10.29 | 2026-10-29 | this commit | language/theme/progress tools, auth UX, docs |
| 2026.10.29a | 2026-10-29 | `783dbf7` | language switcher, light hero |
| 2026.10.28b | 2026-10-28 | `d456bea` | XSS escaping |
| 2026.10.28a | 2026-10-28 | `88f4072` | DB-authoritative details, a11y, server removal |
| 2026.10.28 | 2026-10-28 | `cc25ccb` | RLS, rate limits, consent, legal |
| 2026.10.27c | 2026-10-27 | `ad71b5f` | shop search/sort fix |
| 2026.10.27b | 2026-10-27 | `2396ab4` | admin dock, compact menu |
| 2026.10.27a | 2026-10-27 | `d4fa2ab` | skeleton loader, nav dock |
| 2026.10.27 | 2026-10-27 | `341d64f` | mobile grid, marketplace removal |

Versions are dates, not semantic versions: the site is deployed continuously from
`main`.
