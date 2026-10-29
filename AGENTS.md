# Agent / contributor rules for this repository

## Documentation is part of the change

`docs/README.md` maps a 62-item documentation checklist to files. Any change that
alters behaviour, schema, API, configuration, deploy steps or security posture must
update the matching document **in the same commit**.

Minimum for a normal change:

1. Update the relevant `docs/NN-*.md` file.
2. Add an entry to `docs/19-support-and-releases.md` §3 (change log) and §4 (release
   notes if user-visible).
3. Record expensive-to-reverse decisions in `docs/12-development.md` §6 (ADR).
4. If a new file is added to `docs/`, update the coverage map in `docs/README.md`.

Docs must describe what the code does. If something is not built, not measured, or
waiting on a third-party account, say so plainly under a **Status** line. Do not
invent metrics, customers, reviews, or completed work.

## Code rules

- No secrets in the frontend. Only the Supabase publishable key may ship.
- The database is authoritative for prices, stock, roles and orders.
- Enable RLS and write policies in the same SQL file that creates a table.
- Escape every value interpolated into `innerHTML` with `esc()`.
- No new runtime dependency without a note in `docs/11-tech-stack.md` and
  `docs/12-development.md` §7.
- Bump the `?v=` asset token in every HTML file when CSS/JS changes.
- `node --check` changed JS files and run `node build.js` before committing.

## Verification before commit

```
node --check js/<changed>.js
node build.js
```

Then run the regression checklist in `docs/13-testing-qa.md` §8 for anything that
touches checkout, auth or admin.
