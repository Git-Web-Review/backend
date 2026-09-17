import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { Prisma, UserRole, type User } from "@prisma/client";
import { randomUUID } from "crypto";
import { AppException } from "../common/app.exception";
import { ErrorCode } from "../common/error-code.enum";
import { PrismaService } from "../prisma/prisma.service";
import { CreateServiceAccountDto } from "./dto/create-service-account.dto";
import { UpdateServiceAccountDto } from "./dto/update-service-account.dto";
import { InternalJwtService } from "./internal-jwt.service";
import {
  normalizeEmail,
  nullIfBlank,
  requiredText,
  slugify,
} from "./service-account-fields";
import {
  dummyVerify,
  generateSecret,
  hashSecret,
  verifySecret,
} from "./service-account-secrets";

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
    const name = requiredText(dto.name, "Service account name is required");
    const clientId = dto.clientId
      ? await this.reserveClientId(dto.clientId)
      : await this.uniqueClientId(name);
    const email = normalizeEmail(dto.email) ?? `${clientId}@${SERVICE_EMAIL_DOMAIN}`;

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new AppException(
        ErrorCode.SERVICE_ACCOUNT_EMAIL_TAKEN,
        HttpStatus.CONFLICT,
        "A user already exists with this email",
      );
    }

    const clientSecret = generateSecret();
    const secretHash = await hashSecret(clientSecret);

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
          description: nullIfBlank(dto.description),
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
        name: dto.name === undefined ? undefined : requiredText(dto.name, "Service account name is required"),
        description: nullIfBlank(dto.description),
        active: dto.active,
      },
      include: serviceAccountInclude,
    });
  }

  async rotateSecret(
    id: string,
  ): Promise<{ account: ServiceAccountWithUser; clientSecret: string }> {
    const account = await this.findOrThrow(id);
    const clientSecret = generateSecret();
    const secretHash = await hashSecret(clientSecret);

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
      ? await verifySecret(clientSecret, account.secretHash)
      : await dummyVerify(clientSecret);

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
    const base = slugify(source) || "agent";

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
}
