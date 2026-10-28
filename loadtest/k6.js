import http from 'k6/http';
import { sleep, check } from 'k6';

/*
 * FabluX.U.Design — read-only load test.
 *
 * This never creates, changes or deletes data. It exercises the same reads a
 * shopper makes: landing page, shop, live product list, product detail.
 *
 *   k6 run -e BASE_URL=https://fablux.pages.dev ^
 *          -e SUPABASE_URL=https://msisbmcowtggbvasubla.supabase.co ^
 *          -e ANON_KEY=sb_publishable_xxx loadtest/k6.js
 *
 * The default profile is a smoke test. For a capacity test, raise the stages
 * below gradually and watch Supabase CPU / connections / p95 latency.
 */

const BASE = __ENV.BASE_URL || 'http://127.0.0.1:8081';
const SUPABASE = __ENV.SUPABASE_URL || 'https://msisbmcowtggbvasubla.supabase.co';
const KEY = __ENV.ANON_KEY || '';

export const options = {
  scenarios: {
    shoppers: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '30s', target: 10 },
        { duration: '1m', target: 50 },
        { duration: '1m', target: 50 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800', 'p(99)<1500'],
  },
};

const headers = KEY
  ? { apikey: KEY, Authorization: 'Bearer ' + KEY }
  : {};

export default function () {
  const pages = ['/', '/shop.html', '/product.html?id=18', '/faq.html'];
  const page = pages[Math.floor(Math.random() * pages.length)];

  const html = http.get(BASE + page);
  check(html, {
    'page 200': (r) => r.status === 200,
    'page has html': (r) => (r.body || '').includes('<html'),
  });

  if (KEY) {
    const list = http.get(
      SUPABASE + '/rest/v1/products?select=id,name,price,stock&active=eq.1&limit=50',
      { headers }
    );
    check(list, {
      'catalogue 200': (r) => r.status === 200,
      'catalogue json': (r) => Array.isArray(r.json()),
    });
  }

  sleep(Math.random() * 2 + 1);
}
