# 21 — Legal Documents: Privacy, Terms, Cookies, Data Protection

**Status:** published · last reviewed 2026-10-29
The binding text lives in the HTML pages; this file records what each page claims and
what must stay true in the code.

> These are plain-language policies for a small Nigerian direct-to-consumer shop.
> They are not a substitute for advice from a qualified lawyer in the jurisdiction
> where the business is registered.

---

## 1. Page map

| Document | Page | Governing content |
|---|---|---|
| Privacy Policy | `privacy.html` | what is collected, why, retention, rights, contact |
| Terms and Conditions | `terms.html` | contract of sale, pricing, delivery, liability |
| Cookie Policy | `cookies.html` | cookie categories, consent, how to withdraw |
| Returns Policy | `returns.html` | eligibility, window, process |
| Refund Policy | `refund-policy.html` | refund method and timing |
| Consent banner | `js/consent.js` | granular accept/reject, stored choice |

All are linked in the footer of every page and are reachable on mobile.

## 2. Privacy Policy — commitments the code must honour

| Claim in the policy | Where it is implemented |
|---|---|
| We collect name, email, phone, delivery address to fulfil orders | `orders`, `addresses` |
| Passwords are handled by the auth provider, never stored by us | Supabase Auth; `users.password_hash` is legacy and unused |
| We use cookies for preferences (theme, language) and consent | `localStorage` + `googtrans`; `consent.js` |
| Non-essential scripts load only after consent | `consent.js` gates |
| You can request access, correction, deletion | account page, `delete_my_data`, contact form |
| Marketing email only with opt-in | `newsletter_subscribers` + `subscribe_newsletter(p_consent)` |
| We do not sell data | no data-sharing code exists |
| Orders are retained for accounting | documented retention in `07-database.md` §7 |

**Known gap:** `delete_my_data` removes the profile and customer content, but the
Supabase Auth row remains (TD-05). The policy should not claim complete erasure of the
auth record until that is fixed; wording should say "we delete your profile and
activity; a minimal authentication record may remain to prevent fraud and is removed
on request."

## 3. Terms and Conditions — claims to verify

| Claim | Reality |
|---|---|
| Prices are in naira and include VAT where applicable | prices are integers; VAT treatment is a business decision, confirm before launch |
| Delivery fees are shown at checkout | `delivery_fee_default` + express surcharge |
| Payment is on delivery, by bank transfer, or by card/transfer through Paystack (once enabled) | matches `payment_method` values |
| Orders may be cancelled before dispatch | `admin_set_order_status` + stock release |
| Returns follow the Returns Policy | `returns` table + admin workflow |
| We may refuse fraudulent orders | manual, via admin |
| Liability is limited to the order value | business/legal decision, not code |

Card details are entered on Paystack\u2019s hosted checkout, never on this site; the
store therefore holds no card data. Paystack\u2019s own terms and privacy notice apply to
the payment step. While the gateway is not deployed, the store takes payment on
delivery or by bank transfer only.

## 4. Cookie Policy — actual storage

| Name | Type | Purpose | Lifetime | Consent |
|---|---|---|---|---|
| `googtrans` | cookie | Google Translate target language | 1 year | set only when the visitor chooses a language |
| `fablux_theme` | localStorage | light/dark | until cleared | functional |
| `fablux_lang` | localStorage | chosen language | until cleared | functional |
| `fablux_cart_v1` | localStorage | cart | until cleared | strictly necessary |
| `fablux_api_token_v1` | localStorage | signed-in session | 1 h token | strictly necessary |
| `fablux_consent_v1` | localStorage | consent choice | until cleared | strictly necessary |
| `fablux_error_log_v1` | localStorage | last 20 JS errors (support) | until cleared | functional |
| Supabase auth cookies | cookie | session refresh (if used by the SDK) | session | strictly necessary |

No advertising or analytics cookies are set. If an analytics tool is added, this
table, the consent categories, and the CSP must be updated together.

Withdrawing consent: use the cookie banner's "Reject" / settings, or clear site data
in the browser. Rejecting non-essential storage leaves the shop fully usable.

## 5. Data protection (NDPA 2023 / GDPR-aligned)

| Requirement | Implementation | Gap |
|---|---|---|
| Lawful basis recorded | contract + consent | no formal register |
| Data minimisation | only fulfilment data | — |
| Retention schedule | `07-database.md` §7 | auth row retained |
| Subject access | account page + manual export | no automated export |
| Erasure | `delete_my_data` | auth row remains |
| Breach notification | incident runbook | no 72 h timer documented for NDPC |
| Processor agreements | Supabase/Cloudflare standard terms | no signed DPA on file |
| Cross-border transfer | provider SCCs | not reviewed legally |
| DPO | not appointed | not required at this scale, review if processing grows |

Recommended before launch: a one-page internal record of processing (what, why, where,
how long), and a written breach procedure with a named contact.

## 6. Accessibility statement

The site targets WCAG 2.2 AA. It is not formally certified. See
`13-testing-qa.md` §6 for what was and was not tested, and add a public
accessibility statement page if the business wants to make that commitment formally.

## 7. Changes to legal pages

1. Edit the HTML page; keep the "last updated" date accurate.
2. Mirror the change in this document's tables.
3. If the change affects data handling, update `10-security.md` §6 and the cookie
   table above.
4. Announce material changes to newsletter subscribers (when email is configured).
