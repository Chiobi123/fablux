# FabluX.U.Design — launch gates

**Last updated:** 2026-11-10. This file replaces an earlier checklist that listed
features this repository does not have (a Node service, SQLite, Resend, automatic
stock reservations, webhook signature verification). Nothing below is claimed
unless it is true in the code.

A gate is green only when someone has done it and can point at the evidence.

| # | Gate | Why | Where |
|---|---|---|---|
| 1 | Real business details in `settings`: phone, address, and an email someone reads | the contact and policy pages publish them | admin → Settings |
| 2 | Verify the two Brevo senders (`fabluxdesigns@`, `ujuigbani@`) | order mail currently leaves from one address only | Brevo → Senders |
| 3 | Rotate the Brevo SMTP and API keys (both were displayed on screen) | secret hygiene | Brevo + Supabase Vault |
| 4 | One real order end to end: placed → paid → confirmed → shipped → delivered, with mail landing in a real inbox | proves the whole chain, not each screen | `docs/13-testing-qa.md` §5 |
| 5 | Backup taken **and** restored once into a staging project; time recorded | an untested backup is a guess | `docs/BACKUP_RESTORE.md` |
| 6 | `node build.js` → 68 files, `dist/` free of `.sql`/`.md`/`.env` | the build is the deploy boundary | `docs/15-deployment.md` §2 |
| 7 | Headers live: CSP, HSTS, nosniff, frame-options on the deployed origin | security baseline | `docs/15-deployment.md` §4.1 |
| 8 | Smoke test after deploy: home, shop, login, theme, language, admin redirect, `health.json` | catches a broken build in minutes | `docs/15-deployment.md` §4.1 |
| 9 | Light-mode and dark-mode contrast checked on the live pages | AA is a standing requirement | `docs/05-ui-ux.md` §7 |
| 10 | Payments decision recorded: ship Paystack or stay pay-on-delivery for launch | hiding the option is a choice, not a plan | `docs/23-integrations.md` §2 |
| 11 | Custom domain + Search Console, if launching on a real domain | avoids `*.pages.dev` in customer mail | `docs/20-seo.md` |

**Not a gate, but known debt before volume arrives:** stock is not restored on
cancel, `reserved_stock` is unused, and there is no review moderation or contact
inbox (`docs/01-product-requirements.md` §14).
