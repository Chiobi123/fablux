# 16 — Operations: Maintenance, Backup, Restore, Incidents, Continuity

**Status:** procedures written; restore not rehearsed · last reviewed 2026-10-29
Companions: `BACKUP_RESTORE.md`, `MONITORING.md`, `10-security.md`.

---

## 1. Maintenance guide

### 1.1 Routine

| Cadence | Task | Where |
|---|---|---|
| Daily | Check new orders; confirm stock; clear notifications | `/admin.html` |
| Daily | Check `/health.json` and the uptime monitor | monitor dashboard |
| Weekly | Review `contacts`; reply; unsubscribe bounces | admin / email |
| Weekly | Check `products.stock` for zero rows | SQL |
| Weekly | Review `audit_log` for unexpected admin actions | admin |
| Monthly | Review `notifications` failures | admin |
| Monthly | Export orders for accounting | SQL / CSV |
| Monthly | Check Supabase usage vs plan | Supabase dashboard |
| Quarterly | Rotate the publishable key | Supabase + `api-client.js` |
| Quarterly | Verify backups exist and are readable | see §2 |
| Quarterly | Review this document set | `docs/README.md` |
| On change | Bump `?v=`, rebuild, deploy, smoke test | `15-deployment.md` |

### 1.2 Safe change rules

1. Take a backup before any schema change.
2. Apply SQL through `_private-tools/db.js apply` (or the SQL editor), one file at a
   time.
3. Never edit a deployed SQL file to change behaviour for existing rows; add a new
   file.
4. Never deploy on a Friday evening unless it is an emergency fix.
5. Keep `dist/` out of git; the deploy artefact is built, not committed.

### 1.3 Storage hygiene

- Delete unused images from the `product-images` bucket after products are removed.
- Keep the local `images/` folder for hero art only.
- Do not store customer documents anywhere in the repository.

## 2. Backup and recovery plan

### 2.1 What must survive

| Data | Criticality | Source |
|---|---|---|
| `orders`, `order_items`, `payment_transactions` | critical (money) | Postgres |
| `products`, `promo_codes`, `settings` | high (catalogue) | Postgres |
| `users`, `addresses`, `reviews`, `returns` | high (customer) | Postgres |
| `audit_log`, `notifications` | medium | Postgres |
| `auth.users` | high | Supabase Auth |
| Site code | high | GitHub `Chiobi123/fablux` |
| Product images | medium | Supabase Storage |

### 2.2 Backup methods

1. **Supabase automated backups** — depends on plan (free tier has limited/no PITR).
   Check *Database → Backups* in the dashboard.
2. **Logical dump (repository procedure)** — `BACKUP_RESTORE.md`:
   `pg_dump` against `SUPABASE_DB_*`, stored offline, encrypted.
3. **Code** — GitHub is the backup; the repo is the source of truth.
4. **Storage** — download the bucket periodically or enable provider versioning.

### 2.3 Schedule

| Method | Frequency | Retention | Owner |
|---|---|---|---|
| Logical dump | weekly + before every schema change | 8 weeks | maintainer |
| Supabase automated | per plan | per plan | platform |
| Code | every push | full history | GitHub |
| Storage export | monthly | 3 months | owner |

### 2.4 Recovery objectives

| Objective | Target | Reality |
|---|---|---|
| RPO (max data loss) | 24 h | weekly dump → up to 7 days unless the plan has PITR |
| RTO (time to restore) | 4 h | depends on download + `psql` speed |

The honest gap: with weekly logical dumps the RPO is up to 7 days. Increase the dump
frequency or enable PITR before volume makes that unacceptable.

### 2.5 Restore procedure

1. Create a scratch Supabase project (do not restore over production first).
2. `psql "$SUPABASE_DB_URL" -f backup.sql` (or `pg_restore` for custom format).
3. Re-run `setup-*.sql` only if the dump predates a required function.
4. Verify: `select count(*) from products;` and one order with items.
5. Point a local build at the scratch project by temporarily editing `BASE`/`KEY`,
   sign in, open an order.
6. Only then restore production, or migrate data across.

## 3. Backup restoration test report

| Date | Backup | Restored to | Result | Notes |
|---|---|---|---|---|
| — | — | — | **not executed** | Procedure written, no rehearsal yet |

A restore is not "tested" until a row count and one order render have been verified
on the restored copy. Do this before launch (`15-deployment.md` §6.2).

## 4. Incident response

### 4.1 Severity

| Level | Definition | Response time |
|---|---|---|
| P1 | site down, data loss, admin takeover | immediate |
| P2 | checkout broken, orders not recorded | same day |
| P3 | one page broken, translation down | next working day |
| P4 | cosmetic, documentation | scheduled |

### 4.2 Runbook

1. **Detect** — monitor alert, or a customer message.
2. **Contain** — if the admin account is suspected: change its Supabase password,
   confirm `public.users.role` for unknown accounts, rotate the publishable key if the
   site is being abused.
3. **Diagnose** — browser console, `error-log.js` buffer
   (`FabluXErrors.list()`), Supabase logs, `audit_log`, deployment history.
4. **Fix or roll back** — Cloudflare Pages rollback for a bad deploy; SQL
   compensating script for bad data; restore for corruption.
5. **Communicate** — status note to affected customers; no speculation.
6. **Record** — add a post-incident note to `19-support-and-releases.md` §4.
7. **Prevent** — add a regression check to `13-testing-qa.md` §8.

### 4.3 Specific playbooks

| Symptom | First checks | Likely fix |
|---|---|---|
| Blank page | console errors, CSP violations | bad deploy → rollback; CSP host missing |
| "Network problem" on every call | Supabase status, key validity | rotate/restore key |
| Orders not appearing | `create_order` error, stock, RLS | inspect RPC error; fix stock |
| Admin locked out | email correct? role row? | reset password; re-insert role via SQL |
| Language stuck | Google reachable? cookie? | clear `googtrans`, switch to EN |
| Images broken | bucket policy, file exists | re-upload, check public URL |

### 4.4 Contacts

| Role | Who | Channel |
|---|---|---|
| Owner/decision maker | FabluX.U.Design | owner's phone/email |
| Maintainer | repository owner | GitHub issues |
| Supabase support | platform | dashboard |
| Cloudflare support | platform | dashboard |

No 24/7 rota exists; the shop is designed to fail soft.

## 5. Business continuity plan

| Scenario | Impact | Continuity action |
|---|---|---|
| Hosting down (hours) | no sales | post status via social; orders resume when up |
| Database down | no catalogue/checkout | static content pages still serve; take orders manually and enter later |
| Owner unavailable (days) | no fulfilment | second approved admin email exists; document order status in admin |
| Payment processor outage | **N/A** — no processor | — |
| Email outage | no reset emails | admin resets the password via Supabase dashboard |
| Google Translate outage | English only | accepted; notice shown |
| Data loss | orders lost since last backup | restore + reconcile from email/WhatsApp records |
| Long-term closure | data retention | export orders, then delete personal data per policy |

Minimum viable operation: a laptop, the admin URL, and the owner's email. No local
software is required.

## 6. Security update and patch log

| Date | Item | Action |
|---|---|---|
| 2026-10-28 | stored XSS in renderers | all dynamic output escaped (`d456bea`) |
| 2026-10-28 | RLS gaps, rate limits, consent | `setup-security-hardening.sql` |
| 2026-10-28 | unused Express server | removed |
| 2026-10-28 | 18+ gate | removed |
| 2026-10-29 | CSP for Google Translate hosts | `_headers` |
| 2026-10-29 | accounts/logs wiped on request | `_private-tools/wipe-accounts.sql` |

Platform patching (Postgres, GoTrue, CDN) is Supabase's/Cloudflare's responsibility.
Third-party assets (Font Awesome, fonts) are loaded from CDNs at pinned major
versions; review quarterly for advisories.

## 7. On-call reality

There is no on-call rotation. Alerts should go to the owner's phone. Anything that
requires database access outside business hours can wait for the maintainer unless it
is a P1 data-loss event.
