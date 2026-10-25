# Security notes

- Never commit `server/.env`.
- Set a strong unique `ADMIN_PASSWORD` before deployment.
- Use HTTPS in production.
- Put the app behind a reverse proxy/load balancer.
- Use PostgreSQL/shared session storage before running multiple application instances.
- Do not store card numbers or CVV in FabluX.
- Connect a PCI-compliant payment provider for card payments.
- Rotate admin credentials if they are ever exposed.
- Keep Node.js updated.
