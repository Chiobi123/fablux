# FabluX.U.Design Backend

This backend is intentionally organized in small modules so bugs can be isolated and corrected without rewriting the application.

## Structure
- `server.js` — process entry point
- `src/app.js` — HTTP/API routing and static serving
- `src/auth.js` — registration, login, sessions, roles
- `src/security.js` — password hashing and token utilities
- `src/repository.js` — database access boundary
- `src/db.js` — schema, indexes and SQLite connection
- `src/validation.js` — input validation
- `src/seed.js` — initial product/admin bootstrap
- `data/fablux.sqlite` — runtime database (do not commit production data)

## Security
- Passwords use PBKDF2-SHA256 with a unique salt.
- Session tokens are random and only their SHA-256 hashes are stored.
- Admin endpoints require an authenticated `admin` role.
- Request body size is capped.
- Basic request-rate limiting is enabled.
- Security response headers and restrictive CSP are enabled.
- SQL uses parameterized statements.
- Product stock is checked and decremented inside a database transaction.
- Production credentials belong in `.env`, never source files.

## Scaling path
The application keeps database access behind `repository.js`, so the current SQLite adapter can be replaced with PostgreSQL without rewriting the HTTP routes. For production at larger traffic levels, use PostgreSQL, a reverse proxy/load balancer, shared session storage, object storage for product images, and an external email/payment provider.


## Admin access
The administrator login is intentionally not linked from the public site. Start the server and open `/admin-access`. The backend still enforces the `admin` role on every `/api/admin/*` endpoint.

## Password reset email
Password reset is implemented with single-use, expiring tokens. For development, leaving `EMAIL_PROVIDER=none` logs the reset link to the server console. For production, use Resend: set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` (from a verified domain), and `APP_BASE_URL`. Resend's SMTP/API credentials and domain verification are documented by Resend.

## Production notes
Card payments use Paystack on the server. Set `PAYSTACK_SECRET_KEY`, `APP_BASE_URL`, and `PAYMENT_RESERVATION_MINUTES`. The frontend never receives the secret key. Paystack callbacks are verified server-side.
