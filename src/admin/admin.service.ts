import { HttpStatus, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  NotificationType,
  Prisma,
  UserRole,
  type AdminGrant,
  type User,
} from "@prisma/client";
import { AppException } from "../common/app.exception";
import { ErrorCode } from "../common/error-code.enum";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import type { UserWithSettings } from "../users/users.service";
import { AdminRemovalResponseDto } from "./dto/admin-removal-response.dto";
import { AdminTextNotificationDto } from "./dto/admin-text-notification.dto";
import { AdminTextNotificationResponseDto } from "./dto/admin-text-notification-response.dto";

@Injectable()
export class AdminService implements OnModuleInit {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  async onModuleInit() {
    const adminEmails = this.parseAdminEmails(
      this.config.get<string>("ADMINS"),
    );
    if (adminEmails.length === 0) {
      return;
    }

    await Promise.all(adminEmails.map((email) => this.addAdmin(email)));
    this.logger.log(`Bootstrap admins ensured for ${adminEmails.join(", ")}`);
  }

  listAdmins(): Promise<AdminGrant[]> {
    return this.prisma.adminGrant.findMany({ orderBy: { email: "asc" } });
  }

  listUsers(): Promise<UserWithSettings[]> {
    return this.prisma.user.findMany({
      orderBy: { email: "asc" },
      include: {
        settings: true,
        profileImage: {
          select: {
            userId: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
  }

  async addAdmin(email: string): Promise<AdminGrant> {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail) {
      throw new AppException(
        ErrorCode.USER_NOT_FOUND,
        HttpStatus.BAD_REQUEST,
        "Invalid admin email",
      );
    }

    const [grant] = await this.prisma.$transaction([
      this.prisma.adminGrant.upsert({
        where: { email: normalizedEmail },
        update: {},
        create: { email: normalizedEmail },
      }),
      this.prisma.user.updateMany({
        where: { email: normalizedEmail },
        data: { role: UserRole.ADMIN },
      }),
    ]);

    return grant;
  }

  async removeAdmin(email: string): Promise<AdminRemovalResponseDto> {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail) {
      throw new AppException(
        ErrorCode.USER_NOT_FOUND,
        HttpStatus.BAD_REQUEST,
        "Invalid admin email",
      );
    }

    const [adminGrant, adminCount] = await Promise.all([
      this.prisma.adminGrant.findUnique({ where: { email: normalizedEmail } }),
      this.prisma.adminGrant.count(),
    ]);

    if (!adminGrant) {
      throw new AppException(
        ErrorCode.ADMIN_GRANT_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        "Admin grant not found",
      );
    }

    if (adminCount <= 1) {
      throw new AppException(
        ErrorCode.LAST_ADMIN_REMOVAL_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        "Cannot remove the last admin",
      );
    }

    await this.prisma.$transaction([
      this.prisma.adminGrant.delete({ where: { email: normalizedEmail } }),
      this.prisma.user.updateMany({
        where: { email: normalizedEmail },
        data: { role: UserRole.USER },
      }),
    ]);

    return { email: normalizedEmail, removed: true };
  }

  async sendTextNotification(
    sender: User,
    dto: AdminTextNotificationDto,
  ): Promise<AdminTextNotificationResponseDto> {
    const message = this.nullIfBlank(dto.message);
    if (!message) {
      throw new AppException(
        ErrorCode.UNKNOWN_ERROR,
        HttpStatus.BAD_REQUEST,
        "Notification message is required",
      );
    }

    const users = await this.prisma.user.findMany({ select: { id: true } });
    const payload = {
      title: this.nullIfBlank(dto.title),
      message,
      senderEmail: sender.email,
    } satisfies Prisma.InputJsonObject;

    await Promise.all(
      users.map((user) =>
        this.notifications.createForUser(
          user.id,
          NotificationType.TEXT,
          payload,
        ),
      ),
    );

    return { deliveredCount: users.length };
  }

  private normalizeEmail(email?: string | null): string | null {
    const normalized = email?.trim().toLowerCase();
    return normalized || null;
  }

  private nullIfBlank(value?: string | null): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private parseAdminEmails(value?: string | null): string[] {
    const normalizedEmails = new Set<string>();

    for (const email of value?.split(",") ?? []) {
      const normalizedEmail = this.normalizeEmail(email);
      if (normalizedEmail) {
        normalizedEmails.add(normalizedEmail);
      }
    }

    return [...normalizedEmails];
  }
}
