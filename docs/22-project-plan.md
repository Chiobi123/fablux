# 22 — Project Plan, Timeline and Change Requests

**Status:** current · last reviewed 2026-10-29

---

## 1. Phases delivered

| Phase | Scope | Outcome |
|---|---|---|
| 0 — Skeleton | HTML pages, design system, navigation, responsive layout | static brand site |
| 1 — Commerce | catalogue, cart, checkout, orders, tracking | orders recorded in Postgres |
| 2 — Accounts | sign-up/in, addresses, history, returns, reviews, wishlist | customer self-service |
| 3 — Admin | orders, stock, products, promos, outbox, audit | owner runs the shop from a browser |
| 4 — Hardening | RLS, rate limits, XSS escaping, consent, legal pages, CSP | security baseline |
| 5 — Comfort | theme toggle, 79-language switcher, reading progress, header height fix | accessibility/UX pass |
| 6 — Documentation | this 62-item documentation set | handover-quality record |

## 2. Timeline (actual, from git history)

| Date | Milestone |
|---|---|
| 2026-10-27 | storefront structure, mobile grid, admin dock |
| 2026-10-28 | search/sort fix, RLS + rate limits + consent + legal, DB-authoritative details, XSS fix |
| 2026-10-29 | language switcher, light hero, auth UX fixes, data wipe, documentation |

No fixed launch date is recorded. Launch is gated by
`15-deployment.md` §6.3.

## 3. Remaining work (ordered)

| # | Task | Owner | Blocked by |
|---|---|---|---|
| 1 | Upload product photography | owner | photo shoot |
| 2 | Fill store contact/address settings | owner | business details |
| 3 | Re-create the admin account after the wipe | owner | — |
| 4 | Run UAT script (`13-testing-qa.md` §5) | owner | 1–3 |
| 5 | Enable Google OAuth (`09-auth.md` §6) | owner | Google Cloud + Supabase |
| 6 | Choose and connect an email provider | owner | provider decision |
| 7 | Take a backup and rehearse a restore | maintainer | — |
| 8 | Run Lighthouse + axe, record results | maintainer | deployed build |
| 9 | Redeploy with the new CSP and assets | maintainer | — |
| 10 | Custom domain + Search Console verification | owner | domain |

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
| 2026-10-29 | Language switch returns to English first | Approved | fixed with the translating cover |
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
