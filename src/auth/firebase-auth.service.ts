import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, UserRole, type User } from "@prisma/client";
import { AppException } from "../common/app.exception";
import { ErrorCode } from "../common/error-code.enum";
import { isPlaceholderFirebaseUid } from "../common/placeholder-user";
import { PrismaService } from "../prisma/prisma.service";
import { FirebaseService } from "./firebase.service";

const GLOBAL_SETTINGS_ID = "global";

/**
 * Resolves a Firebase ID token into the matching application user,
 * provisioning the user and its settings on first login.
 */
@Injectable()
export class FirebaseAuthService {
  private readonly logger = new Logger(FirebaseAuthService.name);

  private readonly trustedSignInProviders: string[];

  constructor(
    private readonly firebase: FirebaseService,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.trustedSignInProviders = (
      config.get<string>("FIREBASE_TRUSTED_SIGN_IN_PROVIDERS") ?? ""
    )
      .split(",")
      .map((provider) => provider.trim().toLowerCase())
      .filter(Boolean);
  }

  async authenticate(token: string): Promise<User> {
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

    // Before any decision taken on the strength of that address: the allowed
    // domain and the ADMIN role both hang off it.
    this.assertEmailVerified(decoded, email);

    const emailDomain = this.domainFromEmail(email);
    await this.assertDomainAllowed(emailDomain);

    const role = (await this.isAdminEmail(email))
      ? UserRole.ADMIN
      : UserRole.USER;

    const user = await this.resolveUser(decoded.uid, email, role);

    await this.prisma.userSettings.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        mailNotificationsEnabled: false,
        ircNotificationsEnabled: false,
      },
    });

    return user;
  }

  /**
   * Refuses a token whose address is not proven.
   *
   * Without this check, enabling any Firebase provider that does not verify the
   * address — email/password, say — was enough to sign up under an
   * administrator's address: `isAdminEmail` grants ADMIN on that address, and
   * the domain check reads the same one. The backend accepts every token the
   * project issues, whatever the provider, so the guard belongs here and not in
   * the frontend.
   *
   * Some federated IdPs guarantee the address without emitting the
   * `email_verified` claim. FIREBASE_TRUSTED_SIGN_IN_PROVIDERS lists the ones
   * whose assertion is accepted without it, so a whole organisation is not
   * locked out.
   */
  private assertEmailVerified(
    decoded: { email_verified?: boolean; firebase?: { sign_in_provider?: string } },
    email: string,
  ): void {
    if (decoded.email_verified === true) {
      return;
    }

    const provider = decoded.firebase?.sign_in_provider ?? "unknown";
    if (this.trustedSignInProviders.includes(provider.toLowerCase())) {
      return;
    }

    this.logger.warn(
      `Refused sign-in for ${email}: the token carries no verified email and ` +
        `the sign-in provider "${provider}" is not listed in ` +
        `FIREBASE_TRUSTED_SIGN_IN_PROVIDERS`,
    );
    throw new AppException(
      ErrorCode.EMAIL_NOT_VERIFIED,
      HttpStatus.FORBIDDEN,
      "This account's email address is not verified",
    );
  }

  /**
   * Finds the user row for this Firebase account, or creates it.
   *
   * An existing row is linked to the account only when nobody occupies it, that
   * is when it was created ahead of time from a commit trailer. Linking on the
   * address alone, as the previous `upsert` did, handed the row — and its role —
   * to the first Firebase account presenting the same address.
   */
  private async resolveUser(
    firebaseUid: string,
    email: string,
    role: UserRole,
    retryOnConflict = true,
  ): Promise<User> {
    const byUid = await this.prisma.user.findUnique({ where: { firebaseUid } });
    if (byUid) {
      return this.prisma.user.update({
        where: { id: byUid.id },
        data: { email, role },
      });
    }

    const byEmail = await this.prisma.user.findUnique({ where: { email } });

    if (byEmail && !isPlaceholderFirebaseUid(byEmail.firebaseUid)) {
      this.logger.error(
        `Refused sign-in for ${email}: the account is already linked to ` +
          `another identity (user ${byEmail.id}). Firebase uid ${firebaseUid} ` +
          `was not granted access.`,
      );
      throw new AppException(
        ErrorCode.EMAIL_ALREADY_LINKED,
        HttpStatus.CONFLICT,
        "This email address is already linked to another account",
      );
    }

    if (byEmail) {
      this.logger.log(
        `Claiming the placeholder account of ${email} for Firebase uid ${firebaseUid}`,
      );
      return this.prisma.user.update({
        where: { id: byEmail.id },
        data: { firebaseUid, role },
      });
    }

    try {
      return await this.prisma.user.create({
        data: { firebaseUid, email, hostname: "", role },
      });
    } catch (error) {
      // Two first sign-ins racing: the row appeared between the findUnique and
      // the create. Retry once, and the branch above will decide.
      const isUniqueViolation =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002";

      if (isUniqueViolation && retryOnConflict) {
        return this.resolveUser(firebaseUid, email, role, false);
      }

      throw error;
    }
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
