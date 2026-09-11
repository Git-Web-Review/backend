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
APP_LOGO_MAX_BYTES=1048576
FRONTEND_ORIGIN=http://localhost:5173
BACKEND_ALLOWED_HOSTS=localhost,127.0.0.1
```

`ADMINS` is a comma-separated list seeded at startup into the admin grants table. If a user already exists, their role is promoted to `ADMIN`; otherwise the role is applied automatically on their first Firebase login.

Profile images are stored in PostgreSQL. `PROFILE_IMAGE_MAX_BYTES` controls the maximum accepted upload size.

The application logo is stored in PostgreSQL too. `APP_LOGO_MAX_BYTES` controls the maximum accepted upload size.

`FRONTEND_ORIGIN` configures CORS. `BACKEND_ALLOWED_HOSTS` optionally restricts accepted HTTP `Host` headers; leave it empty to disable backend host filtering. Values are comma-separated, and `*` allows every host.

OAuth domains are managed by admins through `PATCH /v1/admin/settings`. When no domain is configured, all authenticated Firebase emails are accepted, which is convenient for local development.

The customer branding shown in the top bar (custom application name and logo) is managed by admins through `PATCH /v1/admin/settings` and `PATCH|DELETE /v1/admin/settings/logo`, and read by every signed-in user through `GET /v1/branding` and `GET /v1/branding/logo`. A blank name falls back to `git-web-review`, and no logo means no image at all.

## Development

The project uses Prisma 7, which requires Node.js 22.12+ or a newer supported runtime. The Docker image uses Node.js 24.

```sh
npm install
npm run prisma:generate
npm run prisma:migrate
npm run start:dev
```

Swagger is available at `/api`.

## API documentation

Swagger UI is served at `/api` and the raw OpenAPI document at `/api-json`. The
document can also be produced without running the service, which is what CI and
client generators should use:

```sh
npm run openapi:generate          # writes ./openapi.json
npm run openapi:generate -- doc/openapi.json
```

It boots Nest in preview mode, so it needs neither PostgreSQL, Redis nor
Firebase credentials.

### Writing a client or an agent

Agents authenticate as a **service account** rather than through Firebase:

1. An admin creates one with `POST /v1/admin/service-accounts` and copies the
   `clientId` and the `clientSecret` from the response. The secret is stored
   hashed and is never readable again.
2. The agent exchanges them for a token with `POST /v1/auth/token`.
3. Every other call carries `Authorization: Bearer <accessToken>`. Ask for a
   new token once `expiresAt` has passed.

The account acts as a real user, so its reviews and comments stay attributed to
it and it is bound by the same permissions.

Two conventions make the document worth generating a client from:

- Every failure shares the same body, an `ErrorCode` plus a human message.
  Branch on the code, never on the message.
- Every enum is a named schema (`ReviewStatus`, `NotificationType`, ...), so a
  generated client exposes them as real types instead of inline string unions.

### Documenting a new route

The decorators live in `src/common/swagger` and `src/auth/api-controller.decorators`:

- `@ApiAuthenticatedController(tag, path)` or `@ApiAdminController(tag, path)`
  on the class declares the route prefix, the guard, the bearer schemes and the
  `401`/`403` responses together, so they cannot drift apart. Use
  `@ApiAdminOnly()` to restrict a single route of an otherwise readable
  controller.
- `@ApiEndpoint({ summary, type, validation, notFound })` on the method covers
  the operation prose, the success response and the error responses it can
  produce.
- `@UuidParam("id", "...")` replaces `@Param("id")` and documents the path
  parameter at the same time.

Response and request shapes are plain classes with `@ApiProperty`. Reuse
`DeletionResponseDto` and `ApiErrorResponseDto` rather than redeclaring their
shape.

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
