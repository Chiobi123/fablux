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

- `public.is_admin()` — `exists(select 1 from users where id = auth.uid() and role='admin')`.
- `public.assert_admin()` — raises `admin only` if the above is false; every admin
  RPC calls it first.
- RLS policies use `auth.uid()` for ownership and `is_admin()` for administrative
  access (`07-database.md` §3).
- The role cannot be self-assigned: the trigger overwrites `role` from the email
  allow-list, and `users_update` does not let a customer change their own role.

Admin emails are hard-coded in `allowed_admin_email()`:
`ujunwaivbani@gmail.com`, `igbanichiobievere@gmail.com`. Adding an admin requires a
new SQL deployment.

## 6. Google sign-in

### 6.1 Current state — not working, and why

Verified 2026-10-29 against the live project:

```
GET /auth/v1/authorize?provider=google&redirect_to=https://fablux.pages.dev/account.html
→ 400 {"code":400,"error_code":"validation_failed",
       "msg":"Unsupported provider: provider is not enabled"}
```

The frontend is complete; Supabase has no Google client configured. This cannot be
fixed from the repository — it needs the project owner's Google Cloud account and
Supabase dashboard.

The button no longer navigates into that JSON error: `FabluXAPI.googleAvailable()`
probes the endpoint and the UI shows *"Google sign-in is not enabled yet. Please sign
in with your email instead."*

### 6.2 Steps to enable (owner, ~10 minutes)

1. **Google Cloud Console** → *APIs & Services* → *OAuth consent screen*:
   - User type: External; publishing status may stay "Testing" for a private shop.
   - App name: `FabluX.U.Design`; support email; developer contact.
   - Scopes: `userinfo.email`, `userinfo.profile` (no sensitive scopes).
2. *Credentials* → *Create credentials* → *OAuth client ID* → **Web application**.
3. Authorised JavaScript origins:
   - `https://fablux.pages.dev`
   - `http://127.0.0.1:8086` (local preview — optional)
4. Authorised redirect URI (this is Supabase, not the site):
   - `https://msisbmcowtggbvasubla.supabase.co/auth/v1/callback`
5. Copy the **Client ID** and **Client secret**.
6. **Supabase dashboard** → *Authentication* → *Providers* → *Google*:
   - Enable, paste Client ID + secret, save.
7. *Authentication* → *URL Configuration*:
   - Site URL: `https://fablux.pages.dev`
   - Additional redirect URLs: `https://fablux.pages.dev/account.html`,
     `https://fablux.pages.dev/reset-password.html`,
     `https://fablux.pages.dev/login.html`
8. Re-test: `/login.html` → *Continue with Google* → Google consent → returns to
   `account.html` signed in.

### 6.3 Flow used by the code

Implicit flow: `/authorize` redirects back with `#access_token=…`, captured by
`captureHashToken()` and stored like a password sign-in. If the project's Auth flow
is later switched to PKCE, the raw `/authorize` call cannot exchange the code (no
code verifier), so keep **implicit** for this client, or move the button to
`supabase-js` with `signInWithOAuth`.

### 6.4 Failure surfacing

`reportOAuthError()` in `backend-bridge.js` reads `?error=` / `#error=` on landing
and shows the description (e.g. `redirect_uri_mismatch`) instead of failing silently.

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
