# 22 — Project Plan, Timeline and Change Requests

**Status:** current · last reviewed 2026-10-29

---

## 1. Phases delivered

| Phase | Scope | Outcome | State |
|---|---|---|---|
| 0 — Skeleton | HTML pages, design system, navigation, responsive layout | static brand site | done |
| 1 — Backend | Supabase schema, API client, RLS | DB-authoritative data | done |
| 2 — Commerce | catalogue, cart, checkout, orders, tracking | orders recorded in Postgres | done |
| 3 — Accounts | sign-up/in, addresses, history, returns, reviews, wishlist | customer self-service | done |
| 4 — Admin | orders, stock, products, promos, outbox, audit | owner runs the shop from a browser | done |
| 5 — Hardening | RLS, rate limits, XSS escaping, consent, legal pages, CSP | security baseline | done |
| 6 — Comfort | theme toggle, 80-language switcher, reading progress | accessibility/UX pass | done |
| 7 — Auth repair | Google OAuth, profile provisioning, admin escalation closed, email lock | accounts mirror Auth | done |
| 8 — Payments | Paystack Edge Function + `confirm_payment` | code written | **not deployed** |
| 9 — Email | Brevo SMTP for auth mail, outbox + cron, reply routing, contact alerts | mail works end to end | done 2026-10-31 |
| 10 — Dashboard | brand-first hero, sidebar console with KPI cards | owner-facing polish | done 2026-11-03 |
| 11 — Documentation | 62-item set, PRD rewritten, workflows document | handover-quality record | done 2026-11-10 |

## 2. Timeline (actual, from git history)

| Date | Milestone |
|---|---|
| 2026-10-25 | initial storefront, Supabase schema, API client, RLS |
| 2026-10-26 | checkout, orders, tracking, admin console, waybill, returns |
| 2026-10-27 | product manager, promos, customers, sales stats, mobile grid |
| 2026-10-28 | RLS lockdown, rate limits, consent, legal pages, XSS escaping, safe build |
| 2026-10-29 | language switcher rewrite, light hero, honest Google sign-in, documentation set |
| 2026-10-30 | Google OAuth enabled, admin escalation closed, account hub, admin overview, Paystack code |
| 2026-10-31 | Brevo SMTP live on 465, outbox + cron, welcome mail, reply routing, contact alerts |
| 2026-11-03 | brand-first hero, sidebar admin dashboard with KPI cards |
| 2026-11-10 | PRD rewritten against the shipped system, `24-workflows.md` added |

No fixed launch date is recorded. Launch is gated by
`15-deployment.md` §6.3.

## 3. Remaining work (ordered)

| # | Task | Owner | Blocked by |
|---|---|---|---|
| 1 | Click the two Brevo sender confirmations (`fabluxdesigns@`, `ujuigbani@`) | owner | two emails in those inboxes |
| 2 | Decide whether `fabluxudesign.com` exists; fix `settings.store_email` | owner | domain ownership |
| 3 | Deploy the `payments` Edge Function and set Paystack keys | owner | Supabase access token + secret key |
| 4 | Return stock when an order is cancelled | maintainer | — |
| 5 | Decide `reserved_stock`: implement reservation or drop it from the dashboard sum | maintainer | — |
| 6 | Align admin alert recipients with the three-address allow-list | maintainer | — |
| 7 | Rotate the Brevo SMTP and API keys (both were shown on screen) | owner | — |
| 8 | Take a backup and rehearse a restore into staging | maintainer | — |
| 9 | Run one real order end to end and record it in `19` §5 | owner | 1–3 |
| 10 | Run Lighthouse + axe, record results | maintainer | deployed build |
| 11 | Custom domain + Search Console verification | owner | domain |

## 4. Change request process

Use this for anything that changes scope, data model, money handling or the public
contract. For a one-line copy tweak, just do it and note it in the release notes.

### 4.1 Template

```
Change request: <short title>
Requested by:      <name>            Date:
Type:              feature | fix | schema | integration | content
Problem:           <what is wrong or missing today>
Proposed change:   <what will change, in behaviour terms>
Affected:          pages / tables / RPCs / docs / headers
Data impact:       none | additive | destructive (backup required?)
Security impact:   none | reviewed (link to note)
Effort:            hours / days
Acceptance:        <how we know it works>
Rollback:          <revert commit | compensating SQL | restore>
Decision:          approved / rejected / deferred   By:   Date:
```

### 4.2 Rules

1. Destructive schema changes require a fresh backup and a written rollback.
2. Any change to money maths is reviewed against `create_order` before merge.
3. Any new third-party script requires a CSP update + legal/cookie update.
4. Every approved request updates `docs/` in the same commit.
5. Rejected/deferred requests stay in this table with the reason.

### 4.3 Log

| Date | Request | Decision | Note |
|---|---|---|---|
| 2026-10-29 | Language switch lagged and showed a translating screen | Approved | in-place widget switch (ADR-07) |
| 2026-10-29 | Google sign-in not working | Approved (partial) | provider blocked; UX fixed; owner action recorded |
| 2026-10-29 | Produce the 62-document set | Approved | `docs/` created |
| 2026-10-29 | Clear signed-in accounts and logs | Approved | catalogue preserved |

## 5. Estimation guide

| Work type | Typical effort |
|---|---|
| Copy/metadata change | < 1 h |
| New page from an existing template | 2–4 h |
| New RPC + RLS + client wiring | 1 day |
| New third-party integration | 1–3 days (plus account setup) |
| Schema change with migration | 2–4 h + verification |
| Documentation update | 30–60 min per affected file |

## 6. Definition of done

A change is done when:

1. It works in a browser on desktop and at 360 px.
2. `node --check` passes for changed JS; `node build.js` succeeds.
3. Security implications are considered (new input, new script, new table → RLS).
4. `docs/` and the release note are updated.
5. The asset `?v=` token is bumped if CSS/JS changed.
6. The change is deployed and the smoke test passes.
