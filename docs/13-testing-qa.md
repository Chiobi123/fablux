# 13 — Testing, QA, UAT, Accessibility and Compatibility

**Status:** partial — manual verification only · last reviewed 2026-10-29
There is no automated test suite. This document records what was checked, how, and
what remains unverified. It is honest about the gap rather than implying coverage.

---

## 1. Test approach

| Level | Method | Tooling |
|---|---|---|
| Syntax | `node --check` on every changed JS file | Node |
| Build | `node build.js`, inspect the file list | Node |
| Functional | manual browser walkthrough of the golden path | Chrome |
| Data/authorization | direct REST/RPC calls with anon and customer JWTs | browser console / curl |
| Accessibility | keyboard walkthrough, contrast checks, landmark/name review | Chrome + manual |
| Responsive | resize to 360/768/1024/1440, check overflow | Chrome device mode |
| Translation | switch to a non-English language and verify text + no English flash | Chrome |
| Load | k6 script exists, not executed here | k6 (optional) |

## 2. Software testing report (session 2026-10-29)

| # | Test | Result |
|---|---|---|
| T-01 | All `js/*.js` parse (`node --check`) | Pass |
| T-02 | `node build.js` produces `dist/` with 67 files, no `.sql`/`.env` | Pass |
| T-03 | Home page loads with no console errors | Pass |
| T-04 | Shop lists active products; filters/search/sort combine | Pass |
| T-05 | Product page renders price/stock/features from DB | Pass |
| T-06 | Cart add/remove/quantity persists across reload | Pass |
| T-07 | Checkout rejects missing fields inline | Pass |
| T-08 | Order creation writes `orders` + `order_items` (verified in DB) | Pass (pre-wipe) |
| T-09 | Duplicate submit does not create a second order | Pass |
| T-10 | Track page rejects a wrong token | Pass |
| T-11 | Sign-up creates `auth.users` + `public.users` | Pass (pre-wipe) |
| T-12 | Sign-in stores token; account page loads | Pass (pre-wipe) |
| T-13 | Forgot-password sends the recovery email | Not run (needs live inbox) |
| T-14 | Reset link sets a new password | Not run (needs live inbox) |
| T-15 | Admin console loads for an admin, denied for a customer | Pass (pre-wipe) |
| T-16 | Theme toggle persists and both themes are readable | Pass |
| T-17 | Language menu translates the page (Igbo, French verified) | Pass, with the caveat in §3 |
| T-18 | Language switch is in place: no reload and no English flash | Pass (FR, then DE, same document); English restored via the one-reload fallback |
| T-19 | Google button reaches accounts.google.com with the Supabase callback and the right `redirect_to` | Pass (2026-10-30, live project) |
| T-20 | Reading-progress ring tracks scroll and returns to top | Pass |
| T-21 | Header never covers page content at 360–1440 px | Pass |
| T-22 | Light-mode hero photo remains visible | Pass |
| T-23 | Password eye toggle sits beside the field, no overlap | Pass |
| T-24 | `confirm_payment` settles once, replays return `already:true`, one event written | Pass (SQL test, rolled back) |
| T-25 | Checkout rejects an unknown `payment_method` | Pass (constraint applied) |
| T-26 | Paystack redirect + webhook + callback | Not run (function not deployed; needs keys) |
| T-27 | Google consent returns a session and lands on account.html | Not run (needs a Google account) |
| T-24 | Mobile Google button is visible on auth pages | Pass |

## 3. Known test caveats

- Google Translate depends on `translate.google.com`; in the test environment the
  proxy intermittently returned `ERR_TUNNEL_CONNECTION_FAILED`. French and Igbo
  translated successfully; one German attempt did not. After the in-place rewrite,
  FR then DE switched in the same document with no reload; English reloaded once
  because the widget did not restore the original text in time.
- Admin and order tests ran before the 2026-10-29 account wipe. They must be re-run
  after the owner re-creates the admin account.
- `python -m http.server` ignores `_headers`, so CSP behaviour is untested locally.

## 4. QA report

| Area | Assessment |
|---|---|
| Functional completeness | core commerce path implemented; email sending and Google OAuth outstanding |
| Data integrity | constraints + RPC-side validation; no direct order inserts |
| Error handling | human messages; retries on transient network errors |
| Security | see `10-security.md` §5; two medium findings open |
| Accessibility | good baseline, not formally audited with a screen reader |
| Performance | no measurement yet; see `14-performance.md` |
| Content | product photography and store contact details incomplete |
| Documentation | this set |

**QA verdict:** fit for a soft launch once the owner supplies photography, contact
details, and either enables Google OAuth or accepts email-only sign-in.

## 5. User Acceptance Testing (UAT)

No signed UAT has been performed by the business owner. The script below is the
acceptance run to execute before launch; record pass/fail and date.

| ID | Scenario | Expected | Result |
|---|---|---|---|
| UAT-01 | Owner registers with an approved email | lands in admin console | — |
| UAT-02 | Owner adds a product with photo, price, stock | appears on shop | — |
| UAT-03 | Customer orders pay-on-delivery | order visible in admin | — |
| UAT-04 | Owner marks processing → dispatched with courier | customer tracking updates | — |
| UAT-05 | Customer requests a return | admin sees the request | — |
| UAT-06 | Owner applies a promo code | discount correct at checkout | — |
| UAT-07 | Customer resets a forgotten password | new password works | — |
| UAT-08 | Visitor switches language on a phone | page translated, no flash | — |
| UAT-09 | Visitor uses light mode on a phone | readable, hero visible | — |
| UAT-10 | Owner exports an order list for records | data readable | — |

## 6. Accessibility testing report

Method: keyboard-only walkthrough, DOM inspection, contrast spot checks. **No
screen-reader session (NVDA/JAWS/VoiceOver) has been recorded.**

| Check | Result |
|---|---|
| Every image has `alt` (decorative ones `alt=""`) | Pass |
| Form controls have labels | Pass |
| Focus visible on all interactive elements | Pass |
| Skip link to main content | Pass (`a11y.js`) |
| Landmarks: header/nav/main/footer | Pass |
| Heading order (one `h1` per page) | Pass |
| Theme/language controls expose state | Pass (`aria-pressed`, `aria-expanded`) |
| Toast announced | Pass (`role="status"`) |
| Contrast body text ≥ 4.5:1 | Pass in both themes (spot checks) |
| Contrast gold on dark for small text | Borderline — gold is used for eyebrows at larger sizes; do not use it for body copy |
| Reduced motion respected | Pass |
| Zoom to 200% without loss | Pass on content pages |
| No keyboard trap in the language panel | Pass (`details` closes with Esc? — native behaviour, verify) |

Outstanding: a real screen-reader pass, and a formal axe/Lighthouse accessibility
score. Add both before claiming full WCAG 2.2 AA conformance.

## 7. Cross-browser and responsive testing

| Browser | Version tested | Result |
|---|---|---|
| Chrome (desktop) | current, 2026-10 | Primary target; all tests above |
| Edge | Chromium, not separately tested | expected identical |
| Firefox | not tested | expected pass; `details` and grid supported |
| Safari (macOS/iOS) | not tested | risk: `background-attachment: fixed`, `100vh` behaviour |
| Samsung Internet | not tested | risk: custom properties (supported since 21) |

Responsive widths checked: 360, 390, 768, 1024, 1440. No horizontal scrolling; the
header height variable prevents overlap when the nav wraps.

## 8. Regression checklist (run before every release)

1. `node --check` every changed JS file.
2. `node build.js`; confirm the file count and that no `.sql`/`.env` is present.
3. Home, shop, product, cart, checkout, order-success, track, login, register,
   account, admin, 404 — load with no console errors.
4. One product add → checkout → order → admin visibility.
5. Theme toggle on home and shop.
6. Language switch to one non-English language and back to English. Time it:
   the switch must not reload, and a cold switch must resolve within ~3 s.
7. Account hub: each nav section opens, the address book adds and removes an
   address, and no text or button is white-on-white in light mode.
8. Access control: a customer account shows no **Admin console** link, and opening
   `admin.html` while signed in as that customer returns to `account.html`.
9. Sign in with Google on a fresh address, then confirm a `public.users` row exists
   (`select id,email,role from public.users`). An allow-listed address must read
   `admin`.
10. Try `PATCH /rest/v1/users?id=eq.<own id>` with `{"email":"fabluxdesigns@gmail.com"}`
    while signed in as a customer: the row must not change.
11. Admin Overview tab renders counters, the 14-day chart, recent orders and low
    stock; every tab still loads.
12. Resize to 360 px: no overlap, tools reachable, Google button visible on login.
13. Direct REST call to `orders` with the anon key returns no rows.
14. Admin RPC with a customer JWT returns `admin only`.
15. Email: request a password reset and confirm arrival; sign up a fresh address and
    confirm the welcome mail plus a `sent` row in `notifications`
    (`select event,status,attempts from public.notifications order by id desc limit 5`).
    Submit the contact form and confirm the alert carries the customer's address as
    reply-to. Anon reads of `email_settings` must return `[]`.
16. Confirm the asset `?v=` token changed if any CSS/JS changed.

## 9. Gaps and planned tooling

| Gap | Suggested tool | When |
|---|---|---|
| No unit tests for `api-client` pure helpers | Vitest | when a second developer joins |
| No E2E for checkout | Playwright | before a paid ad campaign |
| No accessibility score | axe-core / Lighthouse CI | before launch |
| No SAST | Semgrep (JS + SQL rules) | before launch |
| No visual regression | Playwright screenshots | after the design stabilises |
| Load testing | k6 (`loadtest/k6.js`) | before any traffic push |
