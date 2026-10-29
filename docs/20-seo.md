# 20 — SEO Audit and Configuration

**Status:** current · last reviewed 2026-10-29

---

## 1. Indexable surface

`robots.txt` allows everything except private/transactional paths and points at the
sitemap:

```
Disallow: /admin.html /account.html /checkout.html /orders.html /invoice.html
          /order-success.html /payment-callback.html /reset-password.html
          /forgot-password.html
```

`sitemap.xml` lists 11 public URLs: `/`, `shop.html`, `about.html`, `contact.html`,
`faq.html`, `returns.html`, `refund-policy.html`, `privacy.html`, `cookies.html`,
`terms.html`, `track.html`.

Not in the sitemap (correctly): cart/checkout, account, admin, product detail pages
(they are database-driven and have no static URLs to enumerate), 404.

## 2. Per-page metadata

Every page has:

- `<title>` with the page purpose and the brand.
- `<meta name="description">` — 120–160 characters.
- `<meta name="viewport" content="width=device-width, initial-scale=1">`.
- Canonical link to the production URL.
- Open Graph `og:title`, `og:description`, `og:image`, `og:type`, `og:url`.
- `<html lang="en">` (updated at runtime by the language switcher).

The home page also carries JSON-LD. Verify with the Rich Results Test after any change
to the organisation data.

## 3. Structured data

`index.html` includes `application/ld+json` describing the organisation/store. It must
stay consistent with `settings.store_name`, the contact page and the social profiles.
No `Product` or `Offer` markup is emitted for database products — they are rendered
client-side from query strings, so Google cannot reliably index them. This is a known
limitation, not an oversight:

- Product pages are `product.html?id=…` — one URL pattern, client-rendered.
- Indexing individual products would require static per-product pages or server-side
  rendering. Neither exists.

## 4. Technical checks

| Check | Status |
|---|---|
| HTTPS everywhere, HSTS | Yes (host headers) |
| Mobile-friendly viewport | Yes |
| No `noindex` on public pages | Yes |
| Canonical tags | Yes |
| Sitemap referenced in `robots.txt` | Yes |
| 404 page exists | Yes (`404.html`) |
| Clean URLs / redirects | `.html` URLs are canonical; no redirects defined |
| Duplicate content | Low risk; one URL per page |
| Page speed | Not measured (see `14-performance.md`) |
| Image `alt` text | Present |
| Heading hierarchy | One `h1` per page |
| Internal linking | Header, footer, product cards |

## 5. Content strategy (what ranks)

The site can realistically rank for brand terms and local intent
("premium Nigerian fashion", "Lagos luxury clothing") through:

1. **Product photography + descriptive names.** Currently the weakest input.
2. **About/FAQ content** that answers sizing, delivery and returns.
3. **Policy pages** — they build trust and satisfy Google's store requirements.
4. **Backlinks** from the brand's Instagram/WhatsApp profiles (add the site URL to
   both bios).

What will not rank without new work: individual product pages, category landing
pages, and blog content. Those need either static generation or a content section.

## 6. Measurement

- Google Search Console: verify the domain (DNS or HTML file), submit
  `sitemap.xml`, watch Coverage and Core Web Vitals.
- Bing Webmaster Tools: optional.
- No analytics vendor is installed (`14-performance.md` §6), so on-site behaviour is
  not measured. Search Console provides query/impression data without a cookie banner.

## 7. Launch checklist

- [ ] Replace `fablux.pages.dev` with the final custom domain everywhere
      (`sitemap.xml`, canonicals, OG URLs, Supabase redirect URLs).
- [ ] Verify the domain in Search Console.
- [ ] Submit the sitemap.
- [ ] Add the site URL to Instagram and WhatsApp bios.
- [ ] Fill `store_address`/`store_contact` so local SEO data is real.
- [ ] Confirm the 404 page returns HTTP 404 from the host (Cloudflare Pages does for
      `404.html`).
- [ ] Re-check titles after any copy change; the language switcher must not alter
      the canonical English metadata.
