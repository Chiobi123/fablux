# Backup & Restore Runbook

> **Status:** the procedure below is documented but **was not executed** in this
> session, because a restore needs a second (scratch) Supabase project or a
> local PostgreSQL instance. Do not claim a restore test passed until you have
> actually run it.

## 1. What must be backed up

| Asset | How |
|---|---|
| PostgreSQL data (users, orders, products, promos, settings) | Supabase automated backups / PITR, or `pg_dump` |
| Storage objects (`product-images` bucket) | Supabase Storage download, or `supabase storage cp -r` |
| Auth users | included in the database backup (`auth` schema) |
| Repository code | git (this repo) |
| Environment/secrets | your password manager — **never** in git |

## 2. Supabase automated backups

1. Dashboard → Database → Backups.
2. Confirm daily backups are enabled (availability depends on plan).
3. If your plan offers **Point-in-Time Recovery (PITR)**, enable it. This is the
   difference between losing a day and losing minutes.
4. Record the retention window in your ops notes.

## 3. Manual logical backup (works on any plan)

Run from a trusted machine, never from the browser. The helper reads
`_private-tools/.env`, so it does not contain credentials itself.

```powershell
# from the workspace folder that contains fab7/ and _private-tools/
$envFile = "_private-tools\.env"
$vars = @{}
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$') { $vars[$matches[1]] = $matches[2] }
}
$env:PGPASSWORD = $vars['SUPABASE_DB_PASSWORD']
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
pg_dump -h $vars['SUPABASE_DB_HOST'] -p $vars['SUPABASE_DB_PORT'] `
        -U $vars['SUPABASE_DB_USER'] -d postgres `
        --no-owner --no-privileges -Fc `
        -f "backup-$stamp.dump"
Remove-Item Env:\PGPASSWORD
```

Store the dump encrypted and off-site. Verify it is not empty:

```powershell
Get-Item "backup-*.dump" | Select-Object Name,Length
```

## 4. Restore test (staging only)

**Never test a restore against production.**

1. Create a scratch Supabase project (or a local Postgres 15 container).
2. Restore:
   ```powershell
   pg_restore -h <scratch-host> -p <port> -U <user> -d postgres `
              --no-owner --no-privileges --clean --if-exists backup-YYYYMMDD-HHmm.dump
   ```
3. Re-run the schema/security scripts in order:
   `setup-supabase.sql` → `setup-rls.sql` → `setup-fulfilment.sql` →
   `setup-promo-codes.sql` → `setup-product-images.sql` →
   `setup-admin-bootstrap.sql` → `setup-security-hardening.sql` →
   `setup-admin-emails.sql` → `setup-email-dispatch.sql`
   (only if the dump did not already contain them).
   `setup-email-dispatch.sql` needs `pg_net` + `pg_cron` and the Vault secret
   `brevo_api_key`; without the secret it is a no-op, not an error.
4. Smoke checks:
   - `GET /rest/v1/products?select=id&limit=1` returns rows.
   - Sign in with a test customer; open My Orders; confirm only that customer's orders.
   - `GET /rest/v1/users` with the anon key returns `401 permission denied`.
   - Place a test order on the scratch project; confirm stock decrements once.
5. Record the restore duration and any errors.

## 5. Recovery targets

| Metric | Target |
|---|---|
| RPO (max data loss) | ≤ 15 minutes with PITR; ≤ 24 h with daily backups |
| RTO (time to restore) | measure it in the staging test above |
| Backup retention | 30 days minimum |

## 6. Before every release

- Take a fresh backup.
- Run `node build.js` and deploy `dist/` only.
- Keep the previous `dist/` artefact so you can roll back the frontend instantly.
