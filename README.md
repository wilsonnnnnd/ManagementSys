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
1. `.env`  fill values (especially `DATABASE_URL` and `JWT_SECRET`).
2. Install dependencies:

```bash
npm install
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
- `src/controllers` — Request handlers
- `src/services` — Business logic and Prisma usage (`users.service.js`, `auth.service.js`)
- `prisma/schema.prisma` — Prisma schema (models `users` and `sessions`)
- `src/db/prisma.js` — Prisma client
- `scripts/` — utility scripts used during development (user listing, password fixes)

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

Testing verification locally:
- If `RESEND_API_KEY` is not configured the app falls back to logging the verification link to the server console; copy that link to complete verification in development.

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
-- `scripts/fix-passwords.js` — convert plaintext `password` values to bcrypt hashes (used during migration/cleanup)
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
- Add password reset endpoints.
- Add structured logging and rate-limiting for auth endpoints.
- Add tests for services and controllers.

Contact
---
See repository maintainers or project README for owner/contact information.
