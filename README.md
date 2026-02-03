# ManagementSys

Overview
---
ManagementSys is a small Node.js backend using Express and Prisma. It provides a user management API with authentication (access + refresh tokens) and session tracking, role-based authorization, and basic input validation.

Features
---
- User CRUD: create, read, update, delete (with owner/admin protections)
- Authentication: login, refresh, logout using access token (JWT) + refresh token (stored in `sessions` table)
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

Important files
---
- `src/app.js` — Express app setup and middleware registration
- `src/server.js` — Server bootstrap
- `src/routes` — Route definitions (`/auth`, `/users`)
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
  - Response: `{ accessToken, refreshToken, user }`
- POST `/auth/refresh`
  - Body: `{ "refreshToken": "..." }`
  - Response: `{ accessToken }`
- POST `/auth/logout`
  - Body: `{ "refreshToken": "..." }` (or send refresh token in `Authorization: Bearer <token>`)

Users (protected — require `Authorization: Bearer <accessToken>`) 
- GET `/users` — list users
- GET `/users/:id` — get user by id
- POST `/users` — create user
  - Body: `{ first_name, last_name, email, password, role? }` (password is hashed)
- PUT `/users/:id` — update user (owner or admin)
- DELETE `/users/:id` — delete user (owner or admin; route protected with `requireRoleOrOwner`)

Authentication flow
---
1. Client calls `/auth/login` with credentials.
2. Server verifies password (bcrypt). If valid, server creates a `sessions` record with a generated refresh token and expiry, and returns an access token (JWT) and the refresh token.
3. Client includes `Authorization: Bearer <accessToken>` on protected requests. Middleware verifies JWT and checks session status in the `sessions` table.
4. When access token expires, client calls `/auth/refresh` with the refresh token to obtain a new access token.
5. Logout marks the session's `revoked_at` field.

Database (Prisma)
---
- Model `users` stores user details and `password_hash`.
- Model `sessions` stores `refresh_token`, `refresh_expires_at`, `revoked_at`, and relation to `users`.

Development utilities
---
- `scripts/list-users.js` — list users from DB
- `scripts/fix-passwords.js` — convert plaintext `password_hash` values to bcrypt hashes (used during migration/cleanup)
- `scripts/test-login.js` — helper to test `auth.service.login` locally

Testing with Postman
---
See `Postman-Testing.md` for a ready guide and environment variables for running authentication and protected requests.

Security notes
---
- Always set a strong `JWT_SECRET` in production; application now throws at startup if missing.
- Consider rotating refresh tokens and using secure cookie storage for refresh tokens in browsers.
- Use HTTPS in production.

Next steps / improvements
---
- Add email verification flows and password reset endpoints.
- Add structured logging and rate-limiting for auth endpoints.
- Add tests for services and controllers.

Contact
---
See repository maintainers or project README for owner/contact information.
