import type { DocumentBuilder } from "@nestjs/swagger";

/**
 * `SecuritySchemeObject` is not re-exported from the package root, so it is
 * recovered from the builder method that consumes it.
 */
type SecuritySchemeDefinition = NonNullable<
  Parameters<DocumentBuilder["addBearerAuth"]>[0]
>;

/**
 * The API accepts two kinds of bearer token on the same `Authorization`
 * header, and `AuthGuard` picks the verifier from the token issuer. They are
 * declared as two named schemes so an operation can advertise both: in OpenAPI
 * a list of security requirements means "any one of these", which is exactly
 * the runtime behaviour.
 */
export const FIREBASE_AUTH_SCHEME = "firebase";
export const SERVICE_ACCOUNT_AUTH_SCHEME = "serviceAccount";

export const FIREBASE_AUTH_SCHEME_DEFINITION: SecuritySchemeDefinition = {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description: [
    "Firebase ID token of a signed-in human, sent as `Authorization: Bearer <token>`.",
    "Obtained by the frontend from the Firebase SDK after an OAuth sign-in.",
  ].join(" "),
};

export const SERVICE_ACCOUNT_AUTH_SCHEME_DEFINITION: SecuritySchemeDefinition = {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description: [
    "Internal token issued by `POST /v1/auth/token` against service account credentials,",
    "sent as `Authorization: Bearer <token>`. This is the flow agents and CI should use:",
    "it needs no Firebase project and works on every route the account's user is allowed on.",
  ].join(" "),
};
