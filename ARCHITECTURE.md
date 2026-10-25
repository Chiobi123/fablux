# FabluX.U.Design architecture

## Request flow
Browser → `js/api-client.js` → `/api/*` → `server/src/app.js` → `auth/validation/repository` → SQLite.

The customer-facing HTML/CSS has not been replaced. Backend integration is added through a small API client and bridge layer.

## Why this is easy to maintain
- `config.js`: all environment configuration in one place.
- `validation.js`: request validation is centralized.
- `security.js`: password/token primitives are isolated.
- `auth.js`: authentication and role checks are isolated.
- `repository.js`: SQL access is isolated from HTTP routes.
- `db.js`: schema/indexes are centralized.
- `app.js`: HTTP routes and response/security policy.
- `backend-bridge.js`: browser-to-API integration, kept separate from the visual design.

A bug in one area can therefore normally be corrected in its own module instead of changing the whole project.

## Production scaling path
The current adapter uses SQLite because it is dependency-free and easy to run locally. The repository boundary is deliberate: for a multi-instance production deployment, replace the repository implementation with PostgreSQL and use shared infrastructure for sessions/files/jobs. Product images should move to object storage, and payments/email should use dedicated providers.
