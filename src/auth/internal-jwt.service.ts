import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

export const INTERNAL_TOKEN_ISSUER = "git-web-review";

const DEFAULT_TTL_SECONDS = 3600;
const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 86400;
const MIN_SECRET_LENGTH = 32;

export type InternalTokenPayload = {
  sub: string;
  iss: string;
  email: string;
  clientId: string;
  serviceAccountId: string;
  iat: number;
  exp: number;
};

export type SignedInternalToken = {
  accessToken: string;
  expiresIn: number;
  expiresAt: Date;
};

/**
 * Signs and verifies the HS256 tokens issued by the internal login flow.
 * Firebase tokens are RS256 and carry a Google issuer, so both kinds of
 * bearer token can safely travel on the same `Authorization` header.
 */
@Injectable()
export class InternalJwtService implements OnModuleInit {
  private readonly logger = new Logger(InternalJwtService.name);
  private secret?: string;

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  onModuleInit() {
    const secret = this.config.get<string>("INTERNAL_JWT_SECRET")?.trim();

    if (!secret) {
      this.logger.warn(
        "INTERNAL_JWT_SECRET is not configured, internal token auth is disabled",
      );
      return;
    }

    if (secret.length < MIN_SECRET_LENGTH) {
      this.logger.error(
        `INTERNAL_JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters, internal token auth is disabled`,
      );
      return;
    }

    this.secret = secret;
  }

  get enabled(): boolean {
    return !!this.secret;
  }

  get ttlSeconds(): number {
    const configured = Number(this.config.get<string>("INTERNAL_JWT_TTL_SECONDS"));
    if (!Number.isFinite(configured) || configured <= 0) {
      return DEFAULT_TTL_SECONDS;
    }

    return Math.min(Math.max(Math.trunc(configured), MIN_TTL_SECONDS), MAX_TTL_SECONDS);
  }

  /**
   * Tells internal tokens apart from Firebase ones without verifying any
   * signature, so the guard can route the token to the right verifier and
   * report a meaningful error.
   */
  isInternalToken(token: string): boolean {
    const payload = this.jwt.decode(token) as { iss?: unknown } | null;
    return payload?.iss === INTERNAL_TOKEN_ISSUER;
  }

  sign(claims: {
    userId: string;
    email: string;
    clientId: string;
    serviceAccountId: string;
  }): SignedInternalToken {
    const expiresIn = this.ttlSeconds;
    const accessToken = this.jwt.sign(
      {
        email: claims.email,
        clientId: claims.clientId,
        serviceAccountId: claims.serviceAccountId,
      },
      {
        secret: this.requireSecret(),
        algorithm: "HS256",
        issuer: INTERNAL_TOKEN_ISSUER,
        subject: claims.userId,
        expiresIn,
      },
    );

    return {
      accessToken,
      expiresIn,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  }

  verify(token: string): InternalTokenPayload {
    return this.jwt.verify<InternalTokenPayload>(token, {
      secret: this.requireSecret(),
      algorithms: ["HS256"],
      issuer: INTERNAL_TOKEN_ISSUER,
    });
  }

  private requireSecret(): string {
    if (!this.secret) {
      throw new Error("Internal token auth is disabled");
    }

    return this.secret;
  }
}
