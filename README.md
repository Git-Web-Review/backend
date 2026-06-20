# backend

Backend API for git-web-review.

This service is a NestJS API using Firebase Authentication, Prisma/PostgreSQL and Redis pub/sub.

## Requirements

- Node.js 22.12+ for local development, or the provided Docker image
- PostgreSQL
- Redis
- A Firebase project with an OAuth provider enabled

## Firebase setup

1. Create or select a Firebase project.
2. Enable the OAuth provider used by the company in Firebase Authentication.
3. Open Project settings, then Service accounts.
4. Generate a new private key.
5. Store it locally as `firebase-service-account.json` in this directory, or mount it as a Docker secret.
6. Do not commit this file.

The backend reads the service account path from `GOOGLE_APPLICATION_CREDENTIALS`.

## Environment

Copy `.env.example` to `.env` and update values:

```env
PORT=3000
DATABASE_URL=postgresql://git_web_review:git_web_review@localhost:5432/git_web_review
REDIS_URL=redis://localhost:6379
GOOGLE_APPLICATION_CREDENTIALS=./firebase-service-account.json
ADMINS=admin@company.tld,review-admin@company.tld
PROFILE_IMAGE_MAX_BYTES=1048576
FRONTEND_ORIGIN=http://localhost:5173
```

`ADMINS` is a comma-separated list seeded at startup into the admin grants table. If a user already exists, their role is promoted to `ADMIN`; otherwise the role is applied automatically on their first Firebase login.

Profile images are stored in PostgreSQL. `PROFILE_IMAGE_MAX_BYTES` controls the maximum accepted upload size.

OAuth domains are managed by admins through `PATCH /v1/admin/settings`. When no domain is configured, all authenticated Firebase emails are accepted, which is convenient for local development.

## Development

The project uses Prisma 7, which requires Node.js 22.12+ or a newer supported runtime. The Docker image uses Node.js 24.

```sh
npm install
npm run prisma:generate
npm run prisma:migrate
npm run start:dev
```

Swagger is available at `/api`.

## Main endpoints

- `GET /health`
- `GET /v1/me`
- `PATCH /v1/me/settings`
- `PATCH /v1/me/profile-image`
- `GET /v1/me/profile-image`
- `DELETE /v1/me/profile-image`
- `GET /v1/notifications`
- `PATCH /v1/notifications/:id/seen`
- `PATCH /v1/notifications/seen`
- `GET /v1/admin/users`
- `GET /v1/admin/admins`
- `POST /v1/admin/admins`
- `DELETE /v1/admin/admins/:email`
- `GET /v1/admin/settings`
- `PATCH /v1/admin/settings`
