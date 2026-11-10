# 14 — Performance, Load, Monitoring, Analytics and Scalability

**Status:** partial — budgets and tooling defined, production numbers not yet
collected · last reviewed 2026-10-29
Companions: `MONITORING.md`, `LOAD_TEST.md`, `loadtest/k6.js`.

---

## 1. Performance budget (targets, not measurements)

| Metric | Target | Notes |
|---|---|---|
| HTML (gzipped) | < 25 KB | largest page is `shop.html` (~63 KB raw) |
| CSS total | < 90 KB raw | 5 files, no framework |
| JS total | < 140 KB raw | no framework, no bundler |
| Hero image | < 150 KB | `hero1.jpg` 79 KB, `hero2.jpg` 79 KB |
| LCP (4G, mid phone) | < 2.5 s | measure with Lighthouse |
| CLS | < 0.1 | fixed header height handled in JS |
| INP | < 200 ms | list rendering is the main risk |
| Catalogue read (PostgREST) | < 300 ms p95 | 50 products |

Nothing in the repository measures these automatically; they are the numbers to
check before a campaign.

## 2. Current design choices that help

- No framework runtime, no hydration, no client router.
- Font Awesome and Google Fonts are the only render-blocking third parties; both are
  cacheable CDN assets.
- Product lists are fetched once per page view, not polled.
- Images use `loading="lazy"` below the fold and explicit `width`/`height` where
  known (reduces CLS).
- Google Translate is loaded **only** when a non-English language is selected.
- `_headers` sets `max-age=300, must-revalidate` for CSS/JS and `max-age=0` for HTML,
  so an update is visible on the next load without a purge.

## 3. Load testing

Script: `loadtest/k6.js`. Read-only: home, shop, product list, product detail.

```bash
k6 run -e BASE_URL=https://fablux.pages.dev \
       -e SUPABASE_URL=https://msisbmcowtggbvasubla.supabase.co \
       -e ANON_KEY=sb_publishable_… loadtest/k6.js
```

Default profile: 1→10→50 VUs over 3 minutes. Thresholds:
`http_req_failed < 1%`, `p95 < 800 ms`, `p99 < 1500 ms`.

**Result: not executed against production in this session.** The script and
thresholds are the deliverable; run it before any paid traffic and record the output
in this section.

What to watch during the run (Supabase dashboard): CPU %, active connections, p95
query time, and PostgREST request rate. The static tier scales first; Postgres is the
limit.

## 4. Monitoring and logging

Full procedure in `MONITORING.md`. Summary:

| Signal | Source | Alert |
|---|---|---|
| Storefront up | external uptime check on `/` | 1 min, email/SMS |
| Static health | `/health.json` | 1 min, email |
| API reachable | `GET /rest/v1/` on Supabase | 5 min, email |
| TLS expiry | host dashboard | daily |
| Client errors | `error-log.js` ring buffer (last 20) | manual, on support request |
| Order anomalies | `admin.html` notifications/outbox | manual daily check |
| Security events | `audit_log` | manual review after admin changes |

`health.json` is static and does not prove the database is up — the third check does.

## 5. Performance monitoring report (production)

Not yet measured. To produce the first report:

1. Run Lighthouse (mobile) on `/`, `/shop.html`, `/product.html?id=…`.
2. Run k6 with the default profile.
3. Record: LCP, CLS, INP, total transfer, p95 catalogue latency.
4. Repeat after any change to `shop.js`, `backend-bridge.js` or the hero.

Store results in the table below.

| Date | LCP | CLS | INP | p95 API | Notes |
|---|---|---|---|---|---|
| — | — | — | — | — | not measured |

## 6. Analytics and reporting

- `consent.js` gates non-essential scripts; nothing analytical loads before consent.
- **No analytics vendor is configured.** No GA4, no Meta pixel, no server logs beyond
  the host's own.
- `error-log.js` can post to `window.FABLUX_LOG_ENDPOINT` if a Worker is deployed;
  it is unset.
- Business reporting is done in SQL against the database (orders, AOV, returns,
  newsletter growth — see `02-business-requirements.md` §7).

If analytics are added: choose a privacy-respecting tool, add its origin to CSP
`connect-src`/`script-src`, and update `21-legal.md` + the consent categories.

## 7. Scalability assessment

| Dimension | Current capacity | Limit | Action when hit |
|---|---|---|---|
| Static page views | Cloudflare edge, effectively unbounded | none practical | none |
| Catalogue reads | PostgREST + Postgres, 50 rows | Postgres CPU at high RPS | add HTTP cache or a read replica |
| Order writes | row-locked transaction per order | contention on the same SKU | queueing (not needed at this scale) |
| Auth | Supabase GoTrue | plan-based MAU | upgrade plan |
| Storage | Supabase Storage | plan quota | move images to a CDN/bucket |
| Admin console | loads all orders into the browser | thousands of orders | server-side pagination (currently client-side) |
| Notifications | outbox rows, drained by `pg_cron` every minute (20 per pass) | Brevo's 100/hour send cap | lower `p_limit` or raise the Brevo plan; rows wait, checkout does not |
| Translation | client-side Google | rate limits / outages | fallback to English (implemented) |

The system is designed for a single-operator boutique, not for flash sales. The first
thing that breaks under a spike is the admin order list (client-side filtering) —
acceptable, because it is used by one person.

## 8. Cost at scale (qualitative)

Free tiers cover a boutique's traffic. The first paid step is Supabase (database size
or MAU), not hosting. Email volume on Brevo is the second. Card processing would
introduce per-transaction fees and PCI obligations (`23-integrations.md`).
