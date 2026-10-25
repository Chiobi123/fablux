# FabluX backend setup

1. Install Node.js 22+.
2. Copy `server/.env.example` to `server/.env`.
3. Set a strong `ADMIN_PASSWORD` before production.
4. Start from the project root:
   `node server/server.js`
5. Open `http://127.0.0.1:5000`.

The database is created automatically at `server/data/fablux.sqlite`.

The backend now handles real account registration/login, sessions, addresses, orders, reviews, returns, contact messages, newsletter subscriptions, public settings and protected admin controls.
