# FabluX.U.Design — Production Launch Checklist

## Completed in this build
- Server-side order totals (client cannot choose its own discount amount).
- Paystack backend initialization and server-side verification path.
- Paystack webhook signature verification.
- Payment transaction records and idempotent paid-order finalization.
- Temporary stock reservations for card payments; expired reservations are released automatically.
- Password reset token expiry/single-use flow.
- Admin role enforcement on admin APIs.
- Request IDs and centralized error responses.

## Still requires your external accounts/configuration
1. Create a Paystack business/test account and obtain the secret key. Keep it server-side only.
2. Create a Resend account, verify your sending domain, and obtain an API key.
3. Register a production domain and enable HTTPS.
4. Deploy the Node service to a production host.
5. Use PostgreSQL (or another managed production database) for multi-instance/high-growth deployment rather than local SQLite.
6. Set production environment variables in the host's secret manager/environment settings.
7. Configure Paystack callback URL and webhook URL to the deployed HTTPS domain.
8. Run test payments in Paystack test mode, then switch to live keys only after end-to-end verification.
9. Configure automated database backups and test a restore.
10. Perform a final mobile/desktop/browser checkout test and verify order, payment, email and admin flows.

## Security rules
- Never put PAYSTACK_SECRET_KEY or RESEND_API_KEY in frontend JavaScript.
- Never commit `.env`.
- Use a unique strong ADMIN_PASSWORD in production.
- Set NODE_ENV=production and APP_BASE_URL to the HTTPS domain.
- Restrict ALLOWED_ORIGINS to the production origin.
- Use a managed PostgreSQL database and its connection pooling for multiple app instances.
