# Monitoring & Error Logging

## 1. Uptime monitoring

Use any external monitor (UptimeRobot, Better Stack, Pingdom, or a cron job):

| Check | URL | Interval | Alert |
|---|---|---|---|
| Storefront | `https://fablux.pages.dev/` | 1 min | email + SMS |
| Health file | `https://fablux.pages.dev/health.json` | 1 min | email |
| API reachability | `https://msisbmcowtggbvasubla.supabase.co/rest/v1/` | 5 min | email |
| TLS certificate | host dashboard | daily | email |

`health.json` is a static file and does **not** prove Supabase is up. The third
check does: it should return `401`/`200` JSON, never a network error.

## 2. Client error logging

`js/error-log.js` runs on every page and:

- keeps the last 20 errors in `localStorage` (`fablux_error_log_v1`),
- exposes `window.FabluXErrors.list()` and `.clear()` for support,
- sends a beacon only if `window.FABLUX_LOG_ENDPOINT` is set.

To collect errors centrally, deploy a tiny serverless endpoint (Cloudflare
Worker / Supabase Edge Function) and set the endpoint before the script loads:

```html
<script>window.FABLUX_LOG_ENDPOINT = 'https://your-worker.example.com/log';</script>
<script src="js/error-log.js" defer></script>
```

Do **not** put secrets in that endpoint. It should accept small JSON bodies and
drop anything that looks like a password or card number.

## 3. Server/database monitoring

In Supabase:

- **Reports** → API, Database, Auth: watch latency and error rate.
- **Logs** → Postgres / PostgREST / Auth: filter for `error`, `permission denied`.
- **Billing** → set a **spend cap** and a budget alert at 50% / 80% / 100%.
- Enable email alerts for database CPU and disk.

## 4. Business alerts (recommended)

| Event | Why |
|---|---|
| `create_order` failure spike | checkout is broken or stock is locked |
| Payment status stuck `pending` > 24 h | transfer not confirmed |
| Admin sign-in from a new country | possible account takeover |
| `rate_limit_hits` growth | bot attack on forms |
| Storage nearing quota | uploads will fail |

## 5. Incident checklist

1. Confirm scope: static site, Supabase, DNS, or a single region.
2. Check `health.json`, then the Supabase status page, then host status.
3. If checkout is impacted, pause the CTA/banner and post a status message.
4. Preserve logs; take a backup before any recovery action.
5. After recovery, write a short post-mortem with the timeline and a fix owner.
