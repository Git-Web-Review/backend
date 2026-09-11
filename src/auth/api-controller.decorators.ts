import { applyDecorators, Controller, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  ApiAdminErrorResponses,
  ApiAuthErrorResponses,
} from "../common/swagger/api-error-responses";
import {
  FIREBASE_AUTH_SCHEME,
  SERVICE_ACCOUNT_AUTH_SCHEME,
} from "../common/swagger/api-security";
import type { ApiTagName } from "../common/swagger/api-tags";
import { AdminGuard } from "./admin.guard";
import { AuthGuard } from "./auth.guard";

/**
 * Advertises both bearer flows on an operation. A list of security
 * requirements is an "any of" in OpenAPI, which matches `AuthGuard`: a
 * Firebase ID token and a service account token are equally accepted.
 */
export function ApiBearerTokens() {
  return applyDecorators(
    ApiBearerAuth(FIREBASE_AUTH_SCHEME),
    ApiBearerAuth(SERVICE_ACCOUNT_AUTH_SCHEME),
  );
}

/**
 * A controller every signed-in caller can reach. Bundles the route prefix, the
 * guard and the documentation that has to agree with it, so a route cannot end
 * up guarded but documented as public, or the reverse.
 */
export function ApiAuthenticatedController(tag: ApiTagName, path: string) {
  return applyDecorators(
    ApiTags(tag),
    ApiBearerTokens(),
    ApiAuthErrorResponses(),
    UseGuards(AuthGuard),
    Controller(path),
  );
}

/** A controller reserved for admins: same as above, plus the `403`. */
export function ApiAdminController(tag: ApiTagName, path: string) {
  return applyDecorators(
    ApiTags(tag),
    ApiBearerTokens(),
    ApiAdminErrorResponses(),
    UseGuards(AuthGuard, AdminGuard),
    Controller(path),
  );
}

/**
 * Restricts a single route of an otherwise readable-by-all controller, for the
 * rules and custom fields every user reads but only admins write.
 */
export function ApiAdminOnly() {
  return applyDecorators(UseGuards(AdminGuard), ApiAdminErrorResponses());
}
