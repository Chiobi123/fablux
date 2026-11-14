# 05 — UI/UX Design Documentation

**Status:** living · last reviewed 2026-10-29
This documents the design system actually implemented in `css/style.css`,
`css/responsive.css`, `css/pro.css`, `css/site-tools.css`, `css/hardening.css`.

---

## 1. Design principles

1. **Editorial, not e-commerce-generic.** Large serif display type, wide letter
   spacing, gold accents, photography-led hero.
2. **Quiet chrome.** The header is fixed and thin; tools live in small round
   buttons on the right edge.
3. **One accent.** Gold (`--gold`) is the only decorative colour; everything else
   is ink, paper or muted grey.
4. **Dark by default, light on request.** The brand reads as premium in dark; light
   mode exists for daytime/mobile readability.
5. **Motion is subtle.** Fade/slide reveals, no bouncing, no parallax on mobile.

---

## 2. Design tokens

| Token | Dark value | Light value | Use |
|---|---|---|---|
| `--bg` | `#050505` | `#f6f4ef` | page background |
| `--surface` | `#0d0d0f` | `#ffffff` | cards, header |
| `--text` | `#f5f3ef` | `#171321` | body copy |
| `--muted` | `#9d9d9d` | `#5b5566` | secondary copy |
| `--gold` | `#c9a227` | `#8a6b12` | accent, eyebrows, focus |
| `--line` | `rgba(255,255,255,.12)` | `rgba(20,15,30,.14)` | hairlines |

Type scale (desktop → mobile):

| Role | Size | Family |
|---|---|---|
| Hero display | `clamp(2.4rem, 6vw, 5.2rem)` | `Playfair Display`, serif |
| Section title | `clamp(1.8rem, 3vw, 2.8rem)` | serif |
| Body | `1rem / 1.7` | `Inter`, system sans |
| Eyebrow | `.78rem`, tracking `.28em`, uppercase | sans |
| Button | `.82rem`, tracking `.16em`, uppercase | sans |

---

## 3. Layout

- **Container:** `max-width: 1240px`, gutter `clamp(16px, 4vw, 48px)`.
- **Header:** fixed, measured at runtime into `--header-h`. Page tops are padded by
  that variable so nothing is ever hidden under the header when nav links wrap.
  Below 1200 px the nav wraps onto a second row; the header grows; the CSS var
  follows (via `site-tools.js` `syncHeader()`).
- **Hero:** one full-bleed photograph (`images/hero1.jpg`) with a gradient `.overlay`.
  Each banner file must be a single photograph: they are cropped by
  `background-size: cover`, so a collage shows its gutter as a hard seam and the
  exposure step between the source photos as one half of the banner being darker
  (that is what the 2026-11-11 asset fix removed).
  Below 560 px the home hero swaps to `images/hero1-mobile.jpg`, a 9:16 crop of
  the same photograph, because a 3:1 landscape frame inside a full-height portrait
  box only ever shows a narrow slice of itself.
  The two-slide auto-rotating carousel was removed on 2026-10-30: it was hard-coded
  (no admin control), repeated the same artwork every five seconds and did not
  justify its weight. The section starts
  below the fixed header (`margin-top: var(--header-h)`), so the top of the
  photograph — the model's face — is never hidden behind the bar.
  - **The wordmark is the hero.** Since 2026-11-03 the `h1` is the shop name
    itself (`FabluX`, with `.U.Design` set small and letter-spaced beneath it),
    at `clamp(52px, 8.5vw, 104px)` in `Playfair Display`. The previous headline
    ("Wear Luxury. Live Confidence.") and the `PREMIUM FASHION STORE` eyebrow
    competed with the name and were removed; one short lead line remains.
  - Overlay, dark: a horizontal wash that is nearly opaque on the copy side and
    clear over the photograph (`rgba(10,5,18,.92)` left → `.24` at 72 % →
    `.42` right) layered over a vertical `rgba(0,0,0,.22 → .58)`. The left-heavy
    start is what keeps the wordmark well above the AA contrast threshold without
    flattening the image.
  - Overlay, light: a neutral white scrim, no colour cast. Desktop is a
    horizontal white gradient that is `.92` on the copy side and fades to `0`
    by 74 %, layered with a short bottom fade into the page colour
    (`#f4f2f7`, `0 → 24 %`). The lilac tint it replaced read as a colour cast
    over half the frame, and the dark-mode wash it inherited left a dark band
    under the picture. Under 768 px the scrim is uniform `rgba(255,255,255,.74)`
    plus the same bottom fade, because the copy spans the full width.
- **Product grid:** auto-fill, min 260 px, gap 24 px; 1 column under 520 px.
- **Shop hero:** shorter band, `padding-top: calc(var(--header-h) + 28px)`.

---

## 4. Components

| Component | Where | Notes |
|---|---|---|
| Primary button `.btn` | global | gold fill, ink text, 2 px focus ring |
| Ghost button `.btn-outline` | global | hairline border, inverts on hover |
| Product card | shop | image ratio 3:4, name, price, quick add |
| Toast | `pro.js` | bottom-centre, `role="status"`, auto-dismiss |
| Password field | auth pages | input + eye toggle side by side (never overlapping) |
| Site tools | all pages | theme, language, reading-progress ring |
| Admin tables | admin | sticky header, zebra rows, inline controls |

### Site tools (added 2026-10-29)

- A vertical stack on the right edge: theme toggle, language pill, progress ring.
- 40 px targets, 12 px gap, `z-index` above content but below modals.
- Dark translucent background with a 1 px light border; light theme swaps to
  white with a dark hairline.
- Language panel: `<details>` + `<summary>` pill (`EN` + globe). Panel is a
  two-column scrollable grid of 79 languages with native names, marked
  `translate="no"` so the switcher itself is never machine-translated.
- Switching is in-page: the pill sets the hidden Google widget's `select` value and
  dispatches a bubbling `change`. No reload, no loading screen, and the previous
  language is never shown in between. The `googtrans` cookie is still written so
  the next page opens in the same language. Choosing English clears the cookie and
  restores the original text; if the widget does not restore it, the page reloads
  once (English is then guaranteed).
- The widget script is preloaded when the visitor hovers, focuses or opens the
  language menu, so the first switch no longer waits for a download. A pick that
  arrives before the widget is ready waits at most 2.5 s, then reloads once — the
  cookie is already written, so the reload lands translated. The old 20 s polling
  loop (10 s wait + widget restart + 10 s wait) is gone.
- Pages opened with a saved non-English language load the widget immediately and
  set the select on arrival, so a returning visitor is not left in English.

### Account hub and admin console (added 2026-10-30)

- `account.html` is a two-column hub: a profile card with avatar initials, name,
  email, phone, member-since and role badge, then a section nav (Overview, Delivery
  addresses, Account settings, Help & support, plus Wishlist, Track an order and
  Admin console for administrators).
- Overview shows four counters (orders, in progress, delivered, saved addresses)
  and the three most recent orders with status pills and a tracking link.
- **Delivery addresses** is its own section — address cards plus an "Add address"
  form — so it is named in the nav instead of buried under the profile cards.
- `admin.html` opens on **Overview**: revenue, average order, awaiting payment,
  ready-to-ship, a 14-day daily-sales bar chart, orders by stage, the six most
  recent orders and low-stock alerts. The existing tabs follow unchanged.
- Both pages load `css/dashboard.css`, which defines local `--fx-*` tokens for both
  themes instead of relying on the global `--white`/`--dark` pair (that pair flips
  meaning in light mode and is the reason cards previously went white-on-white).
- Measured contrast on the new components: 6.9:1 or better in both themes for
  labels, values, table headers, pills and buttons.

---

## 5. States

| State | Design |
|---|---|
| Loading (data) | skeleton rows, no spinner flash for <300 ms |
| Empty cart | illustration-free message + "Continue shopping" |
| Error | inline sentence + retry action; never a stack trace |
| Success | toast + persistent confirmation card |
| Language loading | the pill shows the new code; the page translates in place once the widget is ready (first use only) |
| Offline | network message from `friendly()` in `api-client.js` |

---

## 6. Accessibility contract

- Every control has an accessible name (`aria-label` or a `<label>`).
- Focus is always visible: `:focus-visible { outline: 2px solid var(--gold); outline-offset: 3px }`.
- The theme and language controls expose state (`aria-pressed`, `aria-expanded`).
- Motion respects `prefers-reduced-motion: reduce` (no reveal animations).
- Contrast: body text ≥ 4.5:1; large display text ≥ 3:1 in both themes.
- Reading-progress button announces its percentage in `aria-label`.
- No information is conveyed by colour alone (stock state also has text).

---

## 7. Responsive behaviour

| Width | Behaviour |
|---|---|
| ≥1200 px | single-row nav, 4-up product grid, tools at right |
| 900–1199 px | nav wraps to two rows; header height var grows; tools shift down |
| 640–899 px | 2-up grid, tighter gutters, hero text scales |
| ≤640 px | 1-up grid, tools compact to 36 px, body bottom padding 82 px for the mobile dock |

There is no hamburger menu: `.menu-toggle` is intentionally `display:none` because
all links stay visible (wrapping) at every width. This is a deliberate choice —
hiding navigation behind a button on a premium store was judged worse than a
two-row header.

---

## 8. Content rules

- Prices: `₦` + thousands separators, no decimals.
- Product names: title case, no ALL CAPS.
- Buttons: verb-first ("Add to bag", "Track order").
- Errors: say what happened and what to do next.
- No invented reviews, ratings, or "sold X times" claims.
