import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
  Logger,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AppException } from "../common/app.exception";
import { ErrorCode } from "../common/error-code.enum";
import { PrismaService } from "../prisma/prisma.service";
import { FirebaseService } from "./firebase.service";

const GLOBAL_SETTINGS_ID = "global";

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(FirebaseAuthGuard.name);

  constructor(
    private firebase: FirebaseService,
    private prisma: PrismaService,
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

    const token = authHeader.split("Bearer ")[1];
    let decoded: Awaited<ReturnType<FirebaseService["verifyToken"]>>;

    try {
      decoded = await this.firebase.verifyToken(token);
    } catch (error) {
      const firebaseError = error as { code?: string; message?: string };
      this.logger.warn(
        `Firebase token verification failed: ${firebaseError.code ?? "unknown"} ${firebaseError.message ?? ""}`,
      );
      throw new AppException(
        ErrorCode.INVALID_TOKEN,
        HttpStatus.UNAUTHORIZED,
        "Invalid Firebase token",
      );
    }

    const email = decoded.email?.toLowerCase();
    if (!email) {
      throw new AppException(
        ErrorCode.INVALID_TOKEN,
        HttpStatus.UNAUTHORIZED,
        "Firebase token does not contain an email",
      );
    }

    const emailDomain = this.domainFromEmail(email);
    await this.assertDomainAllowed(emailDomain);

    const role = (await this.isAdminEmail(email))
      ? UserRole.ADMIN
      : UserRole.USER;

    const existingUserByUid = await this.prisma.user.findUnique({
      where: { firebaseUid: decoded.uid },
    });
    const user = existingUserByUid
      ? await this.prisma.user.update({
          where: { id: existingUserByUid.id },
          data: { email, role },
        })
      : await this.prisma.user.upsert({
          where: { email },
          update: {
            firebaseUid: decoded.uid,
            role,
          },
          create: {
            firebaseUid: decoded.uid,
            email,
            hostname: "",
            role,
          },
        });

    await this.prisma.userSettings.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        mailNotificationsEnabled: false,
        ircNotificationsEnabled: false,
      },
    });

    request.user = user;
    return true;
  }

  private domainFromEmail(email: string): string {
    return email.split("@")[1] ?? "";
  }

  private async assertDomainAllowed(emailDomain: string): Promise<void> {
    const settings = await this.prisma.globalSettings.upsert({
      where: { id: GLOBAL_SETTINGS_ID },
      update: {},
      create: { id: GLOBAL_SETTINGS_ID },
    });

    if (settings.allowedOAuthDomains.length === 0) {
      return;
    }

    const normalizedDomains = settings.allowedOAuthDomains.map((domain) =>
      domain.toLowerCase(),
    );

    if (!normalizedDomains.includes(emailDomain.toLowerCase())) {
      throw new AppException(
        ErrorCode.EMAIL_DOMAIN_NOT_ALLOWED,
        HttpStatus.FORBIDDEN,
        "Email domain is not allowed",
      );
    }
  }

  private async isAdminEmail(email: string): Promise<boolean> {
    const adminGrant = await this.prisma.adminGrant.findUnique({
      where: { email },
    });

    return !!adminGrant;
  }
}
