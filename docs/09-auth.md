# 09 — Authentication and Authorization

**Status:** current · last reviewed 2026-10-29
Code: `js/api-client.js` (network), `js/backend-bridge.js` (forms), SQL:
`setup-admin-bootstrap.sql`, `setup-rls.sql`, `setup-security-hardening.sql`.

---

## 1. Model

| Actor | Identity | Token |
|---|---|---|
| Guest | none | publishable (anon) key |
| Customer | Supabase Auth user (`email` + `password`) | JWT in `localStorage` |
| Admin | customer whose `public.users.role = 'admin'` | same JWT |
| Google user | Supabase Auth user via OAuth | JWT returned by Supabase |

There are no custom session cookies and no server-side session store in use.
`sessions` and `password_resets` tables are legacy and unused (debt TD-01).

## 2. Sign-up

1. `register.html` posts to `/auth/v1/signup` with `{email, password, data:{name, phone}}`.
2. Supabase creates `auth.users` and returns a session (email confirmation may be
   required depending on project settings).
3. The client inserts a `public.users` row `{id: user.id, email, name, phone}`.
4. The `apply_admin_role` trigger sets `role = 'admin'` when the email is in
   `allowed_admin_email()`, otherwise `customer`.

If step 3 fails, the user still exists in Auth; the next sign-in re-attempts the row
insert (`ensureProfile()` in `api-client.js`).

## 3. Sign-in

`/auth/v1/token?grant_type=password` → `access_token` stored in
`localStorage.fablux_api_token_v1`. The role is read from `public.users` and cached
in `fablux_api_user_v1`.

Expiry: Supabase access tokens last one hour by default. On 401 the client clears
the token and asks the user to sign in again; the cart is untouched.

## 4. Password reset

1. `forgot-password.html` → `POST /auth/v1/recover` with
   `redirect_to = <origin>/reset-password.html`.
2. Supabase emails a link containing a recovery token.
3. `reset-password.html` captures the session and calls `PUT /auth/v1/user`
   with `{password}`.
4. Expired/used links show: "This reset link has expired. Please request a new one."

Requires the redirect URL to be allow-listed in Supabase → Authentication → URL
Configuration. For production that is `https://fablux.pages.dev/reset-password.html`
(plus the site URL). Without it, the email link falls back to the Site URL.

## 5. Authorization

**The database decides.** UI hiding is cosmetic.

- `public.is_admin()` — true only when **all three** hold: `public.users.role = 'admin'`,
  the row's email is in `allowed_admin_email()`, and that email equals the address in
  the verified JWT (`auth.jwt()->>'email'`). Comparing against the token is what stops
  a customer editing their own profile email into an admin address.
- `public.assert_admin()` — raises `admin only` if the above is false; every admin
  RPC calls it first.
- RLS policies use `auth.uid()` for ownership and `is_admin()` for administrative
  access (`07-database.md` §3).
- The role cannot be self-assigned: `apply_admin_role` overwrites `role` from the
  allow-list, and `lock_user_email` keeps `public.users.email` equal to the address
  Supabase Auth owns, so the allow-list cannot be spoofed from the client.

Approved administrators are hard-coded in `allowed_admin_email()`
(`setup-admin-emails.sql`): `fabluxdesigns@gmail.com`, `ujuigbani@gmail.com`,
`igbanichiobiebere@gmail.com`. Changing the list is one SQL deployment.

### 5.1 Profile rows are provisioned by the database

`public.users` is no longer created by the client. A trigger on `auth.users`
(`trg_sync_auth_user`) inserts the matching `public.users` row on every sign-up —
email/password **and** Google OAuth — with the role derived from the allow-list.
Before this, an OAuth sign-in produced an auth account with no profile row, so
`is_admin()` returned false and the owner was treated as a customer. The client
also repairs a missing row in `sessionUser()` as a fallback.

## 6. Google sign-in

### 6.1 Current state — enabled (verified 2026-10-30)

```
GET /auth/v1/settings            -> "google": true
GET /auth/v1/authorize?provider=google&redirect_to=https://fablux.pages.dev/account.html
                                 -> 302 to accounts.google.com
   client_id     = 120742639187-…apps.googleusercontent.com
   redirect_uri  = https://msisbmcowtggbvasubla.supabase.co/auth/v1/callback
```

Flow: button → Supabase `/authorize` → Google consent → Supabase
`/auth/v1/callback` → `<site>/account.html#access_token=…` (implicit). The hash is
captured by `captureHashToken()` in `js/api-client.js`, which stores the session and
strips the fragment, so the token never sits in a page the user can copy by accident.

### 6.2 Configuration in force

| Setting | Value |
|---|---|
| Provider | Google, enabled |
| Client ID | `120742639187-phgtac0det9oqr5feqd0bmn5qp23513t.apps.googleusercontent.com` |
| Client secret | stored in Supabase only — never in the repo, never in the build |
| Google authorised redirect URI | `https://msisbmcowtggbvasubla.supabase.co/auth/v1/callback` |
| Site URL | `https://fablux.pages.dev` |
| Redirect allow-list | `https://fablux.pages.dev/*`, `https://fablux.pages.dev/**`, `https://fablux.igbanichiobiebere.workers.dev/*`, `http://127.0.0.1:8086/*` |

### 6.3 Changing it later

Only a project owner can: Supabase dashboard → *Authentication* → *Sign In /
Providers* → *Google*, or the Management API:

```
PATCH https://api.supabase.com/v1/projects/msisbmcowtggbvasubla/config/auth
Authorization: Bearer <personal access token>
{ "external_google_enabled": true,
  "external_google_client_id": "…apps.googleusercontent.com",
  "external_google_secret": "GOCSPX-…" }
```

The `service_role` key cannot read or write this configuration.

### 6.4 Failure behaviour

`FabluXAPI.googleAvailable()` probes `/auth/v1/authorize` once per click. A 400 with
"Unsupported provider" shows *"Google sign-in is not enabled yet…"* instead of a raw
JSON page. Any transport or CORS failure **fails open** — the visitor is sent to
Google anyway, because a broken probe must never block a working sign-in.

## 7. Account deletion

`delete_my_data()` removes addresses, reviews, returns and the `public.users` row.
The `auth.users` row is not deleted by that function (a Supabase admin API call with
the service role would be needed); this is tracked as TD-05. Orders remain for
accounting.

## 8. Admin bootstrap

There is no shared admin password and none is stored in the repository or in
`_private-tools/.env`. The owner registers with an approved email; the trigger grants
the role. `ADMIN_EMAIL`/`ADMIN_PASSWORD` in `.env` are empty placeholders for a
retired Node server and are not used by the site.

## 9. Threat notes

| Threat | Control |
|---|---|
| Role escalation by editing `localStorage` | role read from DB; RPCs assert server-side |
| Stolen JWT | 1 h lifetime; no refresh token persisted; sign-out clears storage |
| Enumeration via sign-up errors | Supabase generic messages |
| Brute force | Supabase Auth rate limits |
| Password reset link theft | single-use token, short expiry |
| Admin email takeover | Supabase account security + email provider; consider MFA (not enabled) |
