# Load & Capacity Plan

> **Status:** the script in `loadtest/k6.js` is provided and reviewed, but a
> 100,000-concurrent-user or 1,000,000-simultaneous-user test **was not run**
> in this session. That requires dedicated load-generator infrastructure and a
> staging Supabase project. Run it there — never against production traffic
> without a maintenance window.

## 1. What actually scales (and what does not)

| Layer | Scales how |
|---|---|
| HTML/CSS/JS/images | CDN — effectively unlimited; this is the easy part |
| Supabase Auth | managed; rate limits apply |
| PostgREST reads | Supabase compute + connection pooler |
| PostgreSQL writes (`create_order`) | single primary; the real bottleneck |
| Storage images | CDN-backed, public bucket |

A static storefront can serve 100k+ concurrent **browsers** cheaply. The
constraint is how many of them hit the database at once. Most visitors only
read the catalogue, so caching is what makes high concurrency affordable.

## 2. Before you test

1. Use a **staging** Supabase project with production-like data volume.
2. Set a **spend cap** on both projects.
3. Enable Supabase **connection pooling in transaction mode** for the API.
4. Confirm indexes from `setup-security-hardening.sql` are applied.
5. Make sure `Cache-Control` headers from `_headers`/`nginx.conf` are live.

## 3. Run the read-only test

```bash
k6 run -e BASE_URL=https://staging.example.com \
       -e SUPABASE_URL=https://<staging-ref>.supabase.co \
       -e ANON_KEY=<staging publishable key> \
       loadtest/k6.js
```

Start small (50 VUs), then multiply. Watch in Supabase:

- CPU and memory
- active connections vs pooler limit
- p95/p99 latency for `products` and `create_order`
- error rate (5xx, 429)

## 4. Ramp plan

| Step | VUs | Goal |
|---|---|---|
| Smoke | 10 | correctness |
| Baseline | 50 | p95 < 800 ms |
| Peak read | 500 | CDN cache hit ratio > 90% |
| Stress | 2,000 | find the knee |
| Soak | 500 for 1 h | memory leaks / connection exhaustion |

Only after the read path is stable should you test checkout writes, and then
with a **dedicated test product** and cleanup script.

## 5. Reaching very high concurrency

1. **Cache the catalogue** at the edge (short TTL, stale-while-revalidate).
   The shop changes rarely; most requests should never reach Postgres.
2. **Paginate** the shop (e.g. 24 per page) instead of loading all products.
3. **Connection pooler** in transaction mode; never open a connection per user.
4. **Read replicas** for catalogue/review reads if your plan supports them.
5. **Queue writes**: checkout is low-volume compared with browsing; keep the
   `create_order` transaction short.
6. **Images**: serve responsive sizes (WebP/AVIF) via the CDN.
7. **Rate limit** public forms (already implemented in the database).

## 6. Honest expectations

- **100k concurrent active shoppers** is achievable with aggressive CDN caching
  and a mid-size Supabase compute add-on, *if* most requests are cache hits.
- **1,000,000 simultaneous users** is not a single-Postgres target. It requires
  a multi-region CDN, a read-replica/edge-cache strategy, and a queue for writes.
  Treat it as a capacity programme, not a one-off test.
- The write path (`create_order`) is serialised per product row via stock locks.
  Flash-sale traffic needs queueing or per-product limits.

## 7. Reporting

Capture for each step: VUs, RPS, p50/p95/p99, error rate, DB CPU, DB
connections, cache hit ratio. Store results with the release so regressions are
visible.
