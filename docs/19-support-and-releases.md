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

### 2026-10-29

- `feat(site)`: 79-language switcher (native names), theme toggle, reading-progress
  ring; injected into all 28 pages.
- `fix(site)`: language change no longer shows English first — a "Translating…" cover
  is applied from `<head>` and removed when the translation lands (10 s cap, with a
  notice on failure).
- `fix(site)`: language choice now writes the `googtrans` cookie before reload and
  self-heals if local storage and the cookie disagree.
- `fix(auth)`: Google button probes the provider and explains "not enabled" instead
  of navigating to a JSON error; OAuth error params are surfaced on return.
- `fix(site)`: header height measured into `--header-h` so page tops are never
  hidden when the nav wraps.
- `feat(site)`: light-mode hero fade keeps the photograph visible.
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

### Release 2026-10-29 — "Language and comfort"

- **New:** pick from 79 languages; the site switches cleanly, without flashing
  English first.
- **New:** light mode for daytime reading, with the hero photograph still visible.
- **New:** reading-progress ring that returns you to the top.
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
