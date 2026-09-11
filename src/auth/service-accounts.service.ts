import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { Prisma, UserRole, type ServiceAccount, type User } from "@prisma/client";
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { AppException } from "../common/app.exception";
import { ErrorCode } from "../common/error-code.enum";
import { PrismaService } from "../prisma/prisma.service";
import { CreateServiceAccountDto } from "./dto/create-service-account.dto";
import { UpdateServiceAccountDto } from "./dto/update-service-account.dto";
import { InternalJwtService } from "./internal-jwt.service";

const scryptAsync = promisify(scrypt) as (
  secret: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const SECRET_PREFIX = "gwr_sk_";
const SECRET_BYTES = 32;
const SALT_BYTES = 16;
const KEY_BYTES = 64;
const HASH_SCHEME = "scrypt";
const SERVICE_EMAIL_DOMAIN = "service.internal";

export type ServiceAccountWithUser = Prisma.ServiceAccountGetPayload<{
  include: { user: { select: { id: true; email: true; role: true } } };
}>;

const serviceAccountInclude = {
  user: { select: { id: true, email: true, role: true } },
} satisfies Prisma.ServiceAccountInclude;

@Injectable()
export class ServiceAccountsService {
  private readonly logger = new Logger(ServiceAccountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly internalJwt: InternalJwtService,
  ) {}

  list(): Promise<ServiceAccountWithUser[]> {
    return this.prisma.serviceAccount.findMany({
      orderBy: { createdAt: "asc" },
      include: serviceAccountInclude,
    });
  }

  /**
   * Creates the service account together with the user row it acts as, so an
   * agent can be assigned as a reviewer and author comments like a human.
   */
  async create(
    dto: CreateServiceAccountDto,
  ): Promise<{ account: ServiceAccountWithUser; clientSecret: string }> {
    const name = this.requiredText(dto.name, "Service account name is required");
    const clientId = dto.clientId
      ? await this.reserveClientId(dto.clientId)
      : await this.uniqueClientId(name);
    const email = this.normalizeEmail(dto.email) ?? `${clientId}@${SERVICE_EMAIL_DOMAIN}`;

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new AppException(
        ErrorCode.SERVICE_ACCOUNT_EMAIL_TAKEN,
        HttpStatus.CONFLICT,
        "A user already exists with this email",
      );
    }

    const clientSecret = this.generateSecret();
    const secretHash = await this.hashSecret(clientSecret);

    const account = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          hostname: "",
          role: dto.admin ? UserRole.ADMIN : UserRole.USER,
        },
      });

      await tx.userSettings.create({
        data: {
          userId: user.id,
          nickname: name,
          mailNotificationsEnabled: false,
          ircNotificationsEnabled: false,
        },
      });

      if (dto.admin) {
        await tx.adminGrant.upsert({
          where: { email },
          update: {},
          create: { email },
        });
      }

      return tx.serviceAccount.create({
        data: {
          clientId,
          secretHash,
          name,
          description: this.nullIfBlank(dto.description),
          userId: user.id,
        },
        include: serviceAccountInclude,
      });
    });

    this.logger.log(`Service account created: ${clientId}`);
    return { account, clientSecret };
  }

  async update(
    id: string,
    dto: UpdateServiceAccountDto,
  ): Promise<ServiceAccountWithUser> {
    const account = await this.findOrThrow(id);

    return this.prisma.serviceAccount.update({
      where: { id: account.id },
      data: {
        name: dto.name === undefined ? undefined : this.requiredText(dto.name, "Service account name is required"),
        description: this.nullIfBlank(dto.description),
        active: dto.active,
      },
      include: serviceAccountInclude,
    });
  }

  async rotateSecret(
    id: string,
  ): Promise<{ account: ServiceAccountWithUser; clientSecret: string }> {
    const account = await this.findOrThrow(id);
    const clientSecret = this.generateSecret();
    const secretHash = await this.hashSecret(clientSecret);

    const updated = await this.prisma.serviceAccount.update({
      where: { id: account.id },
      data: { secretHash },
      include: serviceAccountInclude,
    });

    this.logger.log(`Service account secret rotated: ${updated.clientId}`);
    return { account: updated, clientSecret };
  }

   /**
   * Drops the credentials and any admin grant, which revokes the account for
   * good. The user row is kept on purpose so the reviews and comments the agent
   * produced stay attributed; it can no longer authenticate through any flow.
   * To erase the user and its activity too, delete it from the admin users
   * page (DELETE /v1/admin/users/:id).
   */
  async remove(id: string): Promise<{ id: string; removed: true }> {
    const account = await this.findOrThrow(id);

    await this.prisma.$transaction([
      this.prisma.adminGrant.deleteMany({
        where: { email: account.user.email },
      }),
      this.prisma.user.update({
        where: { id: account.userId },
        data: { role: UserRole.USER },
      }),
      this.prisma.serviceAccount.delete({ where: { id: account.id } }),
    ]);

    this.logger.log(`Service account deleted: ${account.clientId}`);
    return { id: account.id, removed: true };
  }

  /**
   * Exchanges client credentials for a short-lived internal access token.
   * Errors stay deliberately vague so the endpoint cannot be used to probe
   * which client ids exist.
   */
  async issueToken(clientId: string, clientSecret: string) {
    this.assertInternalAuthEnabled();

    const account = await this.prisma.serviceAccount.findUnique({
      where: { clientId: clientId.trim() },
      include: serviceAccountInclude,
    });

    const secretMatches = account
      ? await this.verifySecret(clientSecret, account.secretHash)
      : await this.dummyVerify(clientSecret);

    if (!account || !secretMatches || !account.active) {
      this.logger.warn(`Failed internal token request for client ${clientId}`);
      throw new AppException(
        ErrorCode.INVALID_CREDENTIALS,
        HttpStatus.UNAUTHORIZED,
        "Invalid client credentials",
      );
    }

    await this.prisma.serviceAccount.update({
      where: { id: account.id },
      data: { lastUsedAt: new Date() },
    });

    const token = this.internalJwt.sign({
      userId: account.userId,
      email: account.user.email,
      clientId: account.clientId,
      serviceAccountId: account.id,
    });

    return { token, account };
  }

  /**
   * Verifies an internal access token and returns the user the agent acts as.
   */
  async authenticateToken(token: string): Promise<User> {
    this.assertInternalAuthEnabled();

    let payload: ReturnType<InternalJwtService["verify"]>;
    try {
      payload = this.internalJwt.verify(token);
    } catch (error) {
      const jwtError = error as { name?: string; message?: string };
      this.logger.warn(
        `Internal token verification failed: ${jwtError.name ?? "unknown"} ${jwtError.message ?? ""}`,
      );
      throw new AppException(
        ErrorCode.INVALID_TOKEN,
        HttpStatus.UNAUTHORIZED,
        "Invalid internal token",
      );
    }

    const account = await this.prisma.serviceAccount.findUnique({
      where: { id: payload.serviceAccountId },
      include: { user: true },
    });

    if (!account || account.userId !== payload.sub) {
      throw new AppException(
        ErrorCode.SERVICE_ACCOUNT_NOT_FOUND,
        HttpStatus.UNAUTHORIZED,
        "Service account no longer exists",
      );
    }

    if (!account.active) {
      throw new AppException(
        ErrorCode.SERVICE_ACCOUNT_DISABLED,
        HttpStatus.FORBIDDEN,
        "Service account is disabled",
      );
    }

    return account.user;
  }

  private assertInternalAuthEnabled(): void {
    if (!this.internalJwt.enabled) {
      throw new AppException(
        ErrorCode.INTERNAL_AUTH_DISABLED,
        HttpStatus.SERVICE_UNAVAILABLE,
        "Internal token auth is not configured",
      );
    }
  }

  private async findOrThrow(id: string): Promise<ServiceAccountWithUser> {
    const account = await this.prisma.serviceAccount.findUnique({
      where: { id },
      include: serviceAccountInclude,
    });

    if (!account) {
      throw new AppException(
        ErrorCode.SERVICE_ACCOUNT_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        "Service account not found",
      );
    }

    return account;
  }

  /** Uses the client id the admin asked for, or fails loudly if it is taken. */
  private async reserveClientId(clientId: string): Promise<string> {
    const normalized = clientId.trim().toLowerCase();

    if (await this.clientIdExists(normalized)) {
      throw new AppException(
        ErrorCode.SERVICE_ACCOUNT_CLIENT_ID_TAKEN,
        HttpStatus.CONFLICT,
        "This client id is already taken",
      );
    }

    return normalized;
  }

  /** Derives a client id from the name, suffixing it until one is free. */
  private async uniqueClientId(source: string): Promise<string> {
    const base = this.slugify(source) || "agent";

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate =
        attempt === 0 ? base : `${base}-${randomUUID().slice(0, 6)}`;

      if (!(await this.clientIdExists(candidate))) {
        return candidate;
      }
    }

    throw new AppException(
      ErrorCode.SERVICE_ACCOUNT_CLIENT_ID_TAKEN,
      HttpStatus.CONFLICT,
      "Could not allocate a free client id",
    );
  }

  private async clientIdExists(clientId: string): Promise<boolean> {
    const existing = await this.prisma.serviceAccount.findUnique({
      where: { clientId },
      select: { id: true },
    });

    return !!existing;
  }

  private slugify(value: string): string {
    return value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
  }

  private generateSecret(): string {
    return `${SECRET_PREFIX}${randomBytes(SECRET_BYTES).toString("base64url")}`;
  }

  private async hashSecret(secret: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const derived = await scryptAsync(secret, salt, KEY_BYTES);
    return `${HASH_SCHEME}$${salt.toString("base64")}$${derived.toString("base64")}`;
  }

  private async verifySecret(secret: string, stored: string): Promise<boolean> {
    const [scheme, saltBase64, hashBase64] = stored.split("$");
    if (scheme !== HASH_SCHEME || !saltBase64 || !hashBase64) {
      return false;
    }

    const expected = Buffer.from(hashBase64, "base64");
    const derived = await scryptAsync(
      secret,
      Buffer.from(saltBase64, "base64"),
      expected.length,
    );

    return expected.length === derived.length && timingSafeEqual(expected, derived);
  }

  /**
   * Burns the same scrypt work on unknown client ids so response time does not
   * reveal whether a client id exists.
   */
  private async dummyVerify(secret: string): Promise<boolean> {
    await scryptAsync(secret, randomBytes(SALT_BYTES), KEY_BYTES);
    return false;
  }

  private normalizeEmail(email?: string | null): string | null {
    const normalized = email?.trim().toLowerCase();
    return normalized || null;
  }

  private nullIfBlank(value?: string | null): string | null | undefined {
    if (value === undefined) {
      return undefined;
    }

    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private requiredText(value: string | undefined, message: string): string {
    const trimmed = value?.trim();
    if (!trimmed) {
      throw new AppException(
        ErrorCode.UNKNOWN_ERROR,
        HttpStatus.BAD_REQUEST,
        message,
      );
    }

    return trimmed;
  }
}
