# ManagementSys

Overview
---
ManagementSys is a small Node.js backend using Express and Prisma. It provides a user management API with authentication (access + refresh tokens) and session tracking, role-based authorization, and basic input validation.

Features
---
- User CRUD: create, read, update, delete (with owner/admin protections)
- Authentication: login, refresh, logout using access token (JWT) + refresh token (stored in `sessions` table)
- Single active session per user: login will create or update a single active `sessions` record for the user (existing active session is replaced)
- Refresh token rotation: calling `/auth/refresh` will rotate the refresh token (server replaces the old refresh token with a new one and returns it)
- Passwords hashed with `bcrypt`
- Role-based authorization (middleware to require `admin` or owner)
- Input validation with `express-validator`
- Prisma ORM for database access (Postgres configured via `DATABASE_URL`)
- Postman test guide included (`Postman-Testing.md`)

Quick start
---
1. Fill values in `.env` (especially `DATABASE_URL` and `JWT_SECRET`).
2. Install dependencies:

```bash
npm install
# Optional: install `dotenv` so the app can load `.env` automatically at startup
npm install dotenv --save
```

3. Generate Prisma client and run migrations (development):

```bash
npx prisma generate
npx prisma migrate dev
```

4. Run in development:

```bash
npm run dev
```

Environment variables
---
- `DATABASE_URL` — Postgres connection string (see `.env.example`)
- `PORT` — HTTP port (default 3000)
- `JWT_SECRET` — HMAC secret for signing access tokens (required)
- `ACCESS_TTL_MIN` — Access token lifetime in minutes
- `REFRESH_TTL_HOURS` — Refresh token lifetime in hours
- `RESEND_API_KEY` — (optional) API key for Resend email service; when set the app will send real verification emails.
- `EMAIL_FROM` — (optional) email `from` address used when sending verification emails (default: `no-reply@managementsyshd.com`).
- `APP_BASE_URL` — (optional) base URL used to build email verification links (default uses `http://localhost:<PORT>`).
- `RATE_LIMIT_WINDOW_SECONDS` — window length in seconds for rate limits (default `3600`).
- `RATE_LIMIT_MAX_PER_IP` — max requests per IP per window (default `5`).
- `RATE_LIMIT_MAX_PER_EMAIL` — max requests per email per window (default `5`).
- `RATE_LIMIT_REDIS_PREFIX` — Redis key prefix for rate limiter keys (default `rl:forgot`).
- `REDIS_URL` — when set and `ioredis` installed, the app uses Redis for counters.

API summary
---
Base URL: `http://localhost:3000`

Auth
- POST `/auth/login`
  - Body: `{ "email": "...", "password": "..." }`
  - Response: `{ accessToken, refreshToken, user }` (server creates or updates a single session record for the user)
- POST `/auth/refresh`
  - Body: `{ "refreshToken": "..." }`
  - Response: `{ accessToken, refreshToken }` — server rotates the refresh token and returns the new one
- POST `/auth/logout`
  - Body: `{ "refreshToken": "..." }` (or send refresh token in `Authorization: Bearer <token>`) — logout marks session as revoked

Admin Emails (admin only)
 - POST `/emails`
   - Headers: `Authorization: Bearer <accessToken>` (must be admin)
   - Body: `{ "to": "user@example.com", "subject": "...", "html": "<p>...</p>" }`
   - Response: `{ sent: true }` on success; server will use `RESEND_API_KEY` if configured, otherwise it logs the email to the server console in development.

Users (protected — require `Authorization: Bearer <accessToken>`)
- GET `/users` — list users
- GET `/users/:id` — get user by id
- POST `/users` — create user
  - Body: `{ first_name, last_name, email, password, role? }` (password is hashed)
- PUT `/users/:id` — update user (owner or admin)
- DELETE `/users/:id` — delete user (owner or admin; route protected with `requireRoleOrOwner`)

Authentication flow
1. Client calls `/auth/login` with credentials.
2. Server verifies password (bcrypt). If valid, server creates or updates a single `sessions` record for the user with a generated refresh token and expiry, and returns an access token (JWT) and the refresh token.
3. Client includes `Authorization: Bearer <accessToken>` on protected requests. Middleware verifies JWT and checks session status in the `sessions` table.
4. When access token expires, client calls `/auth/refresh` with the refresh token to obtain a new access token; the server rotates the refresh token (replaces the stored token) and returns a new `refreshToken` alongside the `accessToken`.
5. Logout marks the session's `revoked_at` field.

Registration & Email Verification
---
- POST `/auth/register`
  - Body: `{ first_name, last_name, email, password }`
  - Behavior: creates a new user with `status: "pending"`, hashes the password, generates a short-lived email verification JWT (15 minutes), and stores `verify_token` and `verify_expires_at` on the user record in the same DB transaction. The server then sends a verification email containing a link to `/auth/verify-email?token=<token>`.
- GET/POST `/auth/verify-email`
  - Query/Body: `{ token }` — the verification JWT from the email link.
  - Behavior: verifies the JWT, ensures it matches the `verify_token` stored on the user and is not expired, then sets `status: "active"` and clears `verify_token` and `verify_expires_at`.

Password reset
---
- POST `/auth/forgot-password`
  - Body: `{ "email": "user@example.com" }`
  - Behavior: generates a one-time reset token for active users, stores a hashed token and expiry on the user record, and sends a reset link to the email. The response is always `200` with a generic message to avoid leaking whether the email exists.
- POST `/auth/reset-password`
  - Body: `{ "token": "<token>", "password": "newPassword" }`
  - Behavior: validates the token (hashed match + expiry), sets the new password (bcrypt), clears the reset fields, and revokes active sessions for the user.

Security & operational notes:
- The server stores only a SHA-256 hash of the reset token (not the plaintext) and sends the plaintext once via email.
- Default token expiry: 60 minutes. Default password policy: minimum 6 characters.

Rate limiting (anti-abuse)
---
- The `/auth/forgot-password` endpoint is protected by rate limiting to prevent abuse. The app supports a Redis-backed limiter (recommended for production) and falls back to an in-memory limiter for single-process development.
- Environment variable: `REDIS_URL` — when set and `ioredis` installed, rate counters are stored in Redis for global enforcement across instances. Without `REDIS_URL`, an in-memory limiter is used.
- Default limits: 5 requests per IP per hour and 5 requests per email per hour. These values can be adjusted in code or promoted to configuration.
- When a request is rejected due to rate limiting the server will respond with HTTP `429` and a JSON body like `{ "error": "<message>", "retryAfter": <seconds> }` and include a `Retry-After` header (seconds) when available. This is set when the limiter middleware attaches `retryAfter` to the error.

Testing password reset locally:
- Trigger a reset request (server will log link when not configured with `RESEND_API_KEY`):

```bash
curl -X POST http://localhost:3000/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}'
```

- Complete the reset (replace `<TOKEN>` with the token from the email/console):

```bash
curl -X POST http://localhost:3000/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token":"<TOKEN>","password":"newPassword123"}'
```

Redis & production notes
---
- Use a dedicated Redis instance and set `REDIS_URL` in your environment to enable the distributed rate limiter. Install `ioredis` (already listed in `package.json`) and ensure the app can connect to Redis at startup.
- In high-scale environments consider more advanced rate-limiting strategies (sliding-window, token bucket, or external API gateway rate limits) and monitoring/alerts for suspicious activity.

Local Redis (quick start with Docker)
---
If you don't have a Redis instance you can run one locally via Docker for development:

```powershell
docker run -d --name redis -p 6379:6379 redis:7
# or with a password:
# docker run -d --name redis -p 6379:6379 redis:7 --requirepass yourpassword
```

Then set `REDIS_URL` in `.env`, for example:
```
REDIS_URL=redis://127.0.0.1:6379/0
# or with password:
# REDIS_URL=redis://:yourpassword@127.0.0.1:6379/0
```

Sending admin emails locally:
- Use a valid admin `accessToken` (include in `Authorization: Bearer <token>`). Example curl:

```bash
curl -X POST http://localhost:3000/emails \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>" \
  -d '{"to":"user@example.com","subject":"Announcement","html":"<p>Hello users</p>"}'
```

Database (Prisma)
---
- Model `users` stores user details and `password` (hashed password).
- Model `sessions` stores `refresh_token`, `refresh_expires_at`, `revoked_at`, and relation to `users`.

Development utilities
---
- `scripts/list-users.js` — list users from DB
- `scripts/fix-passwords.js` — convert plaintext `password` values to bcrypt hashes (used during migration/cleanup)
- `scripts/test-login.js` — helper to test `auth.service.login` locally

Testing with Postman
---
See `Postman-Testing.md` for a ready guide and environment variables for running authentication and protected requests.

Security notes
---
- Always set a strong `JWT_SECRET` in production; application now throws at startup if missing.
- The application now rotates refresh tokens on `/auth/refresh` and maintains a single active session per user by default.
- Use HTTPS in production and consider storing refresh tokens in secure, HttpOnly cookies for browser clients.

Next steps / improvements
---
- Add structured logging and rate-limiting for auth endpoints.
- Add tests for services and controllers.

Contact
---
See repository maintainers or project README for owner/contact information.

Local monitoring stack
----------------------

To run a local Redis with persistence and monitoring (Prometheus + Grafana), use the provided docker-compose in `docker/redis`:

```bash
cd docker/redis
docker compose up -d
```

Notes for this repository (development):
- The compose file maps container Redis `6379` to host `6380` to avoid conflicts with a local Redis that may run on `6379`.
- Grafana has been remapped to host port `3001` in the compose file to avoid a port collision with the API server. If you changed the mapping, update `REDIS_URL` and any local checks accordingly.

The stack exposes (default mapping in `docker/redis/docker-compose.yml`):
- Redis host port: `6380` -> container `6379`
- Prometheus UI: http://localhost:9090
- Grafana UI: http://localhost:3001 (default admin/admin)

If you changed the compose ports, update `REDIS_URL` in `.env` accordingly (e.g. `redis://127.0.0.1:6380`).

Additional notes:
- A backup of your original `.env` was created as `.env.bak` when the environment was tidied. Do not commit secrets from either file.
- To restart only the monitoring stack (no API restart required):

```powershell
cd docker/redis
docker compose down
docker compose up -d
```

Grafana is provisioned to auto-import a basic Redis dashboard. For production use, provide a managed Redis or a proper Redis Cluster and update environment variables accordingly.
