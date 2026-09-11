import { HttpStatus, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  NotificationType,
  Prisma,
  UserRole,
  type AdminGrant,
  type User,
  type UserSettings,
} from "@prisma/client";
import { AppException } from "../common/app.exception";
import { ErrorCode } from "../common/error-code.enum";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateUserSettingsDto } from "../users/dto/update-user-settings.dto";
import { UsersService } from "../users/users.service";
import type { UserWithSettings } from "../users/users.service";
import { AdminRemovalResponseDto } from "./dto/admin-removal-response.dto";
import { AdminTextNotificationDto } from "./dto/admin-text-notification.dto";
import { AdminTextNotificationResponseDto } from "./dto/admin-text-notification-response.dto";
import { UserDeletionPreviewResponseDto } from "./dto/user-deletion-preview-response.dto";
import { UserRemovalResponseDto } from "./dto/user-removal-response.dto";

@Injectable()
export class AdminService implements OnModuleInit {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly usersService: UsersService,
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

  /**
   * Counts everything a deletion would destroy. Deleting a review cascades to
   * its commits and comments, so reviews owned by the user take other people's
   * comments down with them: the admin sees that before confirming.
   */
  async previewUserDeletion(
    currentUser: User,
    userId: string,
  ): Promise<UserDeletionPreviewResponseDto> {
    const user = await this.findUserOrThrow(userId);
    const blockedBy = await this.deletionBlocker(currentUser, user);

    const [
      serviceAccount,
      ownedReviews,
      commentsOnOwnedReviews,
      foreignMessagesOnOwnedReviews,
      authoredMessages,
      reviewerAssignments,
      commitAcks,
      fileViews,
      notifications,
    ] = await this.prisma.$transaction([
      this.prisma.serviceAccount.findUnique({
        where: { userId },
        select: { id: true },
      }),
      this.prisma.review.count({ where: { ownerId: userId } }),
      this.prisma.reviewComment.count({
        where: { review: { ownerId: userId } },
      }),
      this.prisma.reviewCommentMessage.count({
        where: {
          comment: { review: { ownerId: userId } },
          fromId: { not: userId },
        },
      }),
      this.prisma.reviewCommentMessage.count({ where: { fromId: userId } }),
      this.prisma.reviewReviewer.count({ where: { userId } }),
      this.prisma.reviewCommitAck.count({ where: { userId } }),
      this.prisma.reviewFileView.count({ where: { userId } }),
      this.prisma.notification.count({ where: { userId } }),
    ]);

    return {
      userId: user.id,
      email: user.email,
      deletable: !blockedBy,
      blockedBy,
      isServiceAccount: !!serviceAccount,
      ownedReviews,
      commentsOnOwnedReviews,
      foreignMessagesOnOwnedReviews,
      authoredMessages,
      reviewerAssignments,
      commitAcks,
      fileViews,
      notifications,
    };
  }

  /**
   * Deletes a user and everything that points at it. Only users without a
   * Firebase identity can go: anyone who signed in through Firebase would be
   * recreated on their next login anyway.
   *
   * Reviews owned by the user are deleted first, which cascades to their
   * commits, comments and messages whoever wrote them. The remaining traces on
   * other people's reviews are then cleaned by hand, because those foreign keys
   * deliberately have no cascade.
   */
  async deleteUser(
    currentUser: User,
    userId: string,
  ): Promise<UserRemovalResponseDto> {
    const user = await this.findUserOrThrow(userId);
    const blockedBy = await this.deletionBlocker(currentUser, user);

    if (blockedBy) {
      throw new AppException(
        blockedBy,
        blockedBy === ErrorCode.USER_NOT_FOUND
          ? HttpStatus.NOT_FOUND
          : HttpStatus.FORBIDDEN,
        this.deletionBlockerMessage(blockedBy),
      );
    }

    const deletedReviews = await this.prisma.$transaction(async (tx) => {
      const reviews = await tx.review.deleteMany({
        where: { ownerId: userId },
      });

      await tx.reviewCommentMessage.deleteMany({ where: { fromId: userId } });
      await tx.reviewCommentMessage.updateMany({
        where: { toId: userId },
        data: { toId: null },
      });
      await tx.reviewComment.updateMany({
        where: { doneById: userId },
        data: { doneById: null, doneAt: null },
      });
      await tx.reviewReviewer.deleteMany({ where: { userId } });
      await tx.reviewCommitAck.deleteMany({ where: { userId } });
      await tx.reviewFileView.deleteMany({ where: { userId } });
      await tx.adminGrant.deleteMany({ where: { email: user.email } });

      // Settings, profile image, notifications and the service account all
      // cascade from this row.
      await tx.user.delete({ where: { id: userId } });

      return reviews.count;
    });

    this.logger.log(
      `User deleted: ${user.email} (${deletedReviews} owned reviews removed)`,
    );

    return {
      id: user.id,
      email: user.email,
      removed: true,
      deletedReviews,
    };
  }

  private async findUserOrThrow(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new AppException(
        ErrorCode.USER_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        "User not found",
      );
    }

    return user;
  }

  private async deletionBlocker(
    currentUser: User,
    user: User,
  ): Promise<ErrorCode | null> {
    if (user.id === currentUser.id) {
      return ErrorCode.SELF_DELETION_FORBIDDEN;
    }

    if (user.firebaseUid) {
      return ErrorCode.FIREBASE_USER_DELETION_FORBIDDEN;
    }

    const [grant, adminCount] = await Promise.all([
      this.prisma.adminGrant.findUnique({ where: { email: user.email } }),
      this.prisma.adminGrant.count(),
    ]);

    if (grant && adminCount <= 1) {
      return ErrorCode.LAST_ADMIN_REMOVAL_FORBIDDEN;
    }

    return null;
  }

  private deletionBlockerMessage(blocker: ErrorCode): string {
    switch (blocker) {
      case ErrorCode.SELF_DELETION_FORBIDDEN:
        return "You cannot delete your own account";
      case ErrorCode.FIREBASE_USER_DELETION_FORBIDDEN:
        return "Only users without a Firebase identity can be deleted";
      case ErrorCode.LAST_ADMIN_REMOVAL_FORBIDDEN:
        return "Cannot delete the last admin";
      default:
        return "User cannot be deleted";
    }
  }

  async updateUserSettings(
    userId: string,
    dto: UpdateUserSettingsDto,
  ): Promise<UserSettings> {
    await this.findUserOrThrow(userId);

    return this.usersService.updateSettings(userId, dto);
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
