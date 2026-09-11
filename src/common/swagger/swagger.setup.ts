import type { INestApplication } from "@nestjs/common";
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from "@nestjs/swagger";
import { ApiErrorResponseDto } from "../dto/api-error-response.dto";
import { DeletionResponseDto } from "../dto/deletion-response.dto";
import { FileUploadDto } from "../dto/file-upload.dto";
import {
  FIREBASE_AUTH_SCHEME,
  FIREBASE_AUTH_SCHEME_DEFINITION,
  SERVICE_ACCOUNT_AUTH_SCHEME,
  SERVICE_ACCOUNT_AUTH_SCHEME_DEFINITION,
} from "./api-security";
import { API_TAG_DESCRIPTIONS } from "./api-tags";

/** Where Swagger UI is mounted. The raw document is served at `<path>-json`. */
export const SWAGGER_UI_PATH = "api";
export const SWAGGER_JSON_PATH = `${SWAGGER_UI_PATH}-json`;

export const API_VERSION = "0.1.0";

/**
 * Written for whoever builds a client or an agent against this API: it is the
 * first thing they read in Swagger UI, so it covers the parts no individual
 * operation can explain on its own.
 */
const API_DESCRIPTION = `
Backend API for git-web-review: code reviews built from plain git-web links.

## Authenticating

Every route except \`GET /health\` and \`POST /v1/auth/token\` expects
\`Authorization: Bearer <token>\`. Two kinds of token are accepted on that
header and the backend tells them apart by their issuer:

- **${FIREBASE_AUTH_SCHEME}** — a Firebase ID token, for a signed-in human.
- **${SERVICE_ACCOUNT_AUTH_SCHEME}** — an internal token from
  \`POST /v1/auth/token\`. **This is the flow to use for an agent or for CI.**
  An admin creates a service account under \`POST /v1/admin/service-accounts\`
  and hands over the \`clientId\` / \`clientSecret\`; exchanging them returns a
  token that works on every route the account's user is allowed on.

An operation listing both schemes accepts either one.

## Errors

Every failure returns the same envelope: a machine-readable \`code\` from the
\`ErrorCode\` enum and a human \`message\`. Branch on \`code\`, never on the
message text, which is free to change.

## Conventions

- Identifiers are v4 UUIDs unless documented otherwise.
- Timestamps are ISO 8601 strings in UTC.
- Unknown properties in a request body are rejected, not ignored.
- Listing routes that can grow are paginated with \`page\` / \`pageSize\` and
  return the total alongside the items.
`.trim();

function buildConfig(): Omit<OpenAPIObject, "paths"> {
  const builder = new DocumentBuilder()
    .setTitle("git-web-review API")
    .setDescription(API_DESCRIPTION)
    .setVersion(API_VERSION)
    .addBearerAuth(FIREBASE_AUTH_SCHEME_DEFINITION, FIREBASE_AUTH_SCHEME)
    .addBearerAuth(
      SERVICE_ACCOUNT_AUTH_SCHEME_DEFINITION,
      SERVICE_ACCOUNT_AUTH_SCHEME,
    );

  for (const [tag, description] of Object.entries(API_TAG_DESCRIPTIONS)) {
    builder.addTag(tag, description);
  }

  const publicUrl = process.env.BACKEND_PUBLIC_URL?.trim();
  if (publicUrl) {
    builder.addServer(publicUrl, "Configured deployment");
  }

  return builder.build();
}

/**
 * `extraModels` covers the shapes no route references directly by type but
 * that a generated client still needs as a named type.
 */
const EXTRA_MODELS = [ApiErrorResponseDto, DeletionResponseDto, FileUploadDto];

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  return SwaggerModule.createDocument(app, buildConfig(), {
    extraModels: EXTRA_MODELS,
    // `ReviewsController.getOne` reads as `Reviews_getOne`, which most client
    // generators turn into a usable method name.
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey.replace(/Controller$/, "")}_${methodKey}`,
  });
}

export function setupSwagger(app: INestApplication): OpenAPIObject {
  const document = buildOpenApiDocument(app);

  SwaggerModule.setup(SWAGGER_UI_PATH, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: "alpha",
      operationsSorter: "alpha",
      docExpansion: "none",
    },
  });

  return document;
}
