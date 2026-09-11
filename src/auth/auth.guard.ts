import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { AppException } from "../common/app.exception";
import { ErrorCode } from "../common/error-code.enum";
import { FirebaseAuthService } from "./firebase-auth.service";
import { InternalJwtService } from "./internal-jwt.service";
import { ServiceAccountsService } from "./service-accounts.service";

export type AuthMethod = "firebase" | "internal";

/**
 * Accepts both authentication flows on the same `Authorization: Bearer`
 * header: Firebase ID tokens for humans, internal HS256 tokens for service
 * accounts. The issuer claim decides which verifier runs, so a failure is
 * reported against the flow the caller actually meant to use.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly firebaseAuth: FirebaseAuthService,
    private readonly serviceAccounts: ServiceAccountsService,
    private readonly internalJwt: InternalJwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new AppException(
        ErrorCode.MISSING_AUTH_HEADER,
        HttpStatus.UNAUTHORIZED,
        "Missing or invalid authorization header",
      );
    }

    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) {
      throw new AppException(
        ErrorCode.MISSING_AUTH_HEADER,
        HttpStatus.UNAUTHORIZED,
        "Missing or invalid authorization header",
      );
    }

    const method: AuthMethod = this.internalJwt.isInternalToken(token)
      ? "internal"
      : "firebase";

    request.user =
      method === "internal"
        ? await this.serviceAccounts.authenticateToken(token)
        : await this.firebaseAuth.authenticate(token);
    request.authMethod = method;

    return true;
  }
}
