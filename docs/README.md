# FabluX.U.Design — documentation index

Every document below describes the site **as it exists in this repository**, not an
aspiration. Where something is not built, not measured, or waiting on a third-party
account, the document says so in a **Status** line instead of guessing.

Last reviewed: 2026-11-10 · Asset version token in HTML: `?v=20261110a`

---

## How to keep this current

1. Any change to behaviour, schema, API, config or deploy steps must update the
   matching file here **in the same commit**.
2. `19-support-and-releases.md` gets a release-note entry for every user-visible change.
3. `12-development.md` gets an ADR entry for every decision that is expensive to reverse.
4. `README.md` (this file) is updated when a document is added, split or retired.
5. The rule is enforced by review, not by tooling. There is no CI to catch stale docs.

---

## 62-item coverage map

Status: **Done** = written and matches the code · **Partial** = written, some work
outstanding (see the note) · **N/A** = does not apply to this business model.

| # | Item | Document | Status |
|---|------|----------|--------|
| 1 | Project Requirements Document (PRD) | `01-product-requirements.md` | Done |
| 2 | Business Requirements Document (BRD) | `02-business-requirements.md` | Done |
| 3 | Software Requirements Specification (SRS) | `03-srs.md` | Done |
| 4 | Project Scope and Objectives | `01-product-requirements.md` §2 | Done |
| 5 | User Stories and Use Cases | `04-user-stories.md` | Done |
| 6 | UI/UX Design Documentation | `05-ui-ux.md` | Done |
| 7 | System Architecture Document | `06-architecture.md` | Done |
| 8 | Database Design Document (ERD) | `07-database.md` | Done |
| 9 | Technology Stack Documentation | `11-tech-stack.md` | Done |
| 10 | API Specification | `08-api.md` | Done |
| 11 | Security Requirements Document | `10-security.md` §2 | Done |
| 12 | Project Plan and Timeline | `22-project-plan.md` | Done |
| 13 | Source Code Documentation | `12-development.md` §2 | Done |
| 14 | Database Schema and Migration Documentation | `07-database.md` §3 | Done |
| 15 | API Documentation | `08-api.md` | Done |
| 16 | Authentication and Authorization Documentation | `09-auth.md` | Done |
| 17 | Integration Documentation | `23-integrations.md` | Done |
| 18 | Environment Variables and Configuration Guide | `15-deployment.md` §3 | Done |
| 19 | Version Control and Git Workflow Guide | `12-development.md` §5 | Done |
| 20 | Developer Setup Guide | `12-development.md` §3 | Done |
| 21 | Technical Decisions Log (ADR) | `12-development.md` §6 | Done |
| 22 | Change Log | `19-support-and-releases.md` §3 | Done |
| 23 | Testing Documentation | `13-testing-qa.md` | Partial — no automated suite |
| 24 | Known Issues and Bug Log | `19-support-and-releases.md` §2 | Done |
| 25 | Software Testing Report | `13-testing-qa.md` §2 | Partial — manual only |
| 26 | Quality Assurance (QA) Report | `13-testing-qa.md` §4 | Partial — manual only |
| 27 | Security Audit Report | `10-security.md` §5 | Done |
| 28 | Performance and Load Testing Report | `14-performance.md` §3 | Partial — plan + script, not run here |
| 29 | Database Backup and Recovery Plan | `16-operations.md` §2, `BACKUP_RESTORE.md` | Done |
| 30 | Deployment Guide | `15-deployment.md` | Done |
| 31 | Production Readiness Checklist | `15-deployment.md` §6, `../PRODUCTION_LAUNCH_CHECKLIST.md` | Partial — external accounts pending |
| 32 | User Acceptance Testing (UAT) Report | `13-testing-qa.md` §5 | Partial — no signed UAT yet |
| 33 | Accessibility Testing Report | `13-testing-qa.md` §6 | Partial — manual checks only |
| 34 | Cross-Browser and Responsive Testing Report | `13-testing-qa.md` §7 | Partial — Chrome verified |
| 35 | SEO Audit and Configuration Documentation | `20-seo.md` | Done |
| 36 | Privacy Policy | `21-legal.md`, `../privacy.html` | Done |
| 37 | Terms and Conditions | `21-legal.md`, `../terms.html` | Done |
| 38 | Cookie Policy | `21-legal.md`, `../cookies.html` | Done |
| 39 | Data Protection Compliance Documentation | `10-security.md` §6 | Partial — no DPA/registered DPO |
| 40 | Payment Integration and Verification Documentation | `23-integrations.md` §2 | Done |
| 41 | User Manual / User Guide | `17-user-manual.md` | Done |
| 42 | Administrator Manual | `18-admin-manual.md` | Done |
| 43 | Website Maintenance Guide | `16-operations.md` §1 | Done |
| 44 | Monitoring and Logging Documentation | `14-performance.md` §4, `MONITORING.md` | Done |
| 45 | Incident Response and Disaster Recovery Plan | `16-operations.md` §4 | Done |
| 46 | Backup Restoration Test Report | `16-operations.md` §3 | Partial — procedure written, not executed on a staging copy |
| 47 | Performance Monitoring Report | `14-performance.md` §5 | Partial — nothing measured in production yet |
| 48 | Security Update and Patch Log | `16-operations.md` §6 | Done |
| 49 | Release Notes | `19-support-and-releases.md` §4 | Done |
| 50 | Customer Support and Troubleshooting Guide | `19-support-and-releases.md` §1 | Done |
| 51 | Business Continuity Plan | `16-operations.md` §5 | Done |
| 52 | Analytics and Reporting Documentation | `14-performance.md` §6 | Partial — consent-gated, no vendor chosen |
| 53 | Post-Launch Evaluation Report | `19-support-and-releases.md` §5 | N/A until launch |
| 54 | Change Request Documentation | `22-project-plan.md` §4 | Done |
| 55 | Regression Testing Reports | `13-testing-qa.md` §8 | Partial — checklist, not automated |
| 56 | Updated Architecture Documentation | `06-architecture.md` | Done |
| 57 | Database Migration Plans | `07-database.md` §4 | Done |
| 58 | Scalability Assessment Report | `14-performance.md` §7 | Done |
| 59 | Updated API Documentation | `08-api.md` | Done |
| 60 | Dependency and License Inventory | `12-development.md` §7 | Done |
| 61 | Technical Debt Register | `12-development.md` §8 | Done |
| 62 | Version and Release History | `19-support-and-releases.md` §6 | Done |

---

## Document set

| File | Audience | What it answers |
|------|----------|-----------------|
| `01-product-requirements.md` | owner, product | what the shop is, who it is for, what "done" means |
| `02-business-requirements.md` | owner, business | how it makes money, costs, constraints |
| `03-srs.md` | engineers, QA | numbered functional and non-functional requirements |
| `04-user-stories.md` | engineers, QA | stories with acceptance criteria |
| `05-ui-ux.md` | design, frontend | design system, layout, states, a11y rules |
| `06-architecture.md` | engineers, reviewers | components, data flow, trust boundaries |
| `07-database.md` | engineers, DBAs | ERD, every table, RLS, migrations |
| `08-api.md` | engineers | every REST/RPC/Auth call the site makes |
| `09-auth.md` | engineers, owner | sign-up/sign-in/reset/admin/Google |
| `10-security.md` | owner, engineers | threat model, controls, audit results, GDPR/NDPA |
| `11-tech-stack.md` | everyone | what runs where, versions, why |
| `12-development.md` | developers | setup, code map, git, ADRs, deps, debt |
| `13-testing-qa.md` | QA | what was tested, how, results, gaps |
| `14-performance.md` | engineers, owner | budgets, load plan, monitoring, analytics |
| `15-deployment.md` | owner, DevOps | build, headers, env vars, launch steps |
| `16-operations.md` | owner, on-call | backups, restore, incidents, patches, continuity |
| `17-user-manual.md` | shoppers | how to use the shop |
| `18-admin-manual.md` | admin | how to run orders, products, promos |
| `19-support-and-releases.md` | support | troubleshooting, known issues, releases |
| `20-seo.md` | marketing | metadata, sitemap, structured data, limits |
| `21-legal.md` | owner, legal | policy pages and what they claim |
| `22-project-plan.md` | owner | phases, timeline, change requests |
| `23-integrations.md` | engineers | Supabase, payments, Google, Cloudflare |
| `24-workflows.md` | owner, engineers, agents | every end-to-end process: checkout, order lifecycle, payment, email dispatch, release, incident |

Root-level documents, each now pointing at the files above rather than repeating
them: `../PROJECT_COMPLETION_SUMMARY.md` (**start here** — status and handover),
`../PRODUCTION_LAUNCH_CHECKLIST.md` (11 launch gates), `../ARCHITECTURE.md` (short
version of `06`), `../SECURITY.md` (owner-facing security steps),
`../BACKEND_SETUP.md` (Supabase setup), `../FRONTEND_TEST_REPORT.md` (a dated test
report — historical), `BACKUP_RESTORE.md`, `LOAD_TEST.md`, `MONITORING.md`.

---

## Unfinished work at the time of writing

These are tracked in `19-support-and-releases.md` §2 and, in product terms, in
`01-product-requirements.md` §14. The short version:

- Payments: the Paystack Edge Function and `confirm_payment` are written but **not
  deployed**, so the card option is hidden at checkout (verified against
  `paystackEnabled()`).
- Brevo senders `fabluxdesigns@gmail.com` and `ujuigbani@gmail.com` were
  re-created on 2026-10-31 and are still awaiting the confirmation clicks
  (`active: false` in `/v3/senders`); order mail therefore leaves from
  `igbanichiobiebere@gmail.com`.
- Store contact details (`store_contact`, `store_email`, `store_address`):
  `settings.store_email` currently reads `info@fabluxudesign.com`, a domain whose
  mailbox is unconfirmed — see `01` §14 item 2.
- Email sending: live through Brevo (SMTP on port 465 for auth mail, HTTP API from
  `dispatch_emails()` for the outbox). `email_enabled = true`. Senders are verified
  freemail addresses, so a domain with DKIM/DMARC remains the durable fix
  (`23-integrations.md` §6).
- No automated test suite; verification is manual (see `13-testing-qa.md`).