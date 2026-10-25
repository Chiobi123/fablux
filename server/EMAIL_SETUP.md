# FabluX email setup

The application is ready for transactional email. No secret is stored in source code.

## Resend
1. Create a Resend account.
2. Create an API key.
3. Verify the domain you will use for the From address.
4. Copy `.env.example` to `.env`.
5. Set:

```text
EMAIL_PROVIDER=resend
RESEND_API_KEY=your_key_here
EMAIL_FROM=FabluX.U.Design <no-reply@your-verified-domain.com>
APP_BASE_URL=https://your-domain.com
RESET_TOKEN_MINUTES=30
```

Never commit `.env` or the API key. The reset endpoint uses a generic response so it does not reveal whether an email address is registered.
