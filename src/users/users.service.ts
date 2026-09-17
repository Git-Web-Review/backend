import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  Prisma,
  type UserProfileImage,
  type UserSettings,
} from "@prisma/client";
import { AppException } from "../common/app.exception";
import { ErrorCode } from "../common/error-code.enum";
import {
  detectImageFormat,
  SUPPORTED_IMAGE_MIME_TYPES,
} from "../common/image-upload";
import { PrismaService } from "../prisma/prisma.service";
import { ReviewerCandidatePageResponseDto } from "./dto/reviewer-candidate-page-response.dto";
import { SearchReviewerCandidatesQueryDto } from "./dto/search-reviewer-candidates-query.dto";
import { UserProfileImageRemovalResponseDto } from "./dto/user-profile-image-removal-response.dto";
import { UserProfileImageResponseDto } from "./dto/user-profile-image-response.dto";
import { UpdateUserSettingsDto } from "./dto/update-user-settings.dto";
import { WebhookUrlService } from "./webhook-url.service";
import { profileImageMaxBytesFromValue } from "./profile-image.config";
import type { UploadedProfileImageFile } from "./types/uploaded-profile-image-file";

export type UserWithSettings = Prisma.UserGetPayload<{
  include: {
    settings: true;
    profileImage: {
      select: {
        userId: true;
        mimeType: true;
        sizeBytes: true;
        createdAt: true;
        updatedAt: true;
      };
    };
  };
}>;

export const userSummarySelect = {
  id: true,
  email: true,
  hostname: true,
  settings: {
    select: {
      nickname: true,
      mailNotificationsEnabled: true,
      ircNotificationsEnabled: true,
      webhookNotificationsEnabled: true,
      profileImageUrl: true,
    },
  },
  profileImage: { select: { userId: true } },
} satisfies Prisma.UserSelect;

export type UserSummary = Prisma.UserGetPayload<{
  select: typeof userSummarySelect;
}>;

export function toUserSummary(user: UserSummary) {
  return {
    id: user.id,
    email: user.email,
    hostname: user.hostname,
    nickname: user.settings?.nickname ?? null,
    mailNotificationsEnabled: user.settings?.mailNotificationsEnabled ?? false,
    ircNotificationsEnabled: user.settings?.ircNotificationsEnabled ?? false,
    webhookNotificationsEnabled:
      user.settings?.webhookNotificationsEnabled ?? false,
    hasProfileImage: !!user.profileImage,
    profileImageUrl: user.settings?.profileImageUrl ?? null,
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly webhookUrls: WebhookUrlService,
  ) {}

  async getMe(userId: string): Promise<UserWithSettings> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
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

    if (!user) {
      throw new AppException(
        ErrorCode.USER_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        "User not found",
      );
    }

    return user;
  }

  async listReviewerCandidates(
    currentUserId: string,
    query: SearchReviewerCandidatesQueryDto,
  ): Promise<ReviewerCandidatePageResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const search = query.q?.trim();
    const excludedUserIds = [
      ...new Set([
        ...(query.includeSelf ? [] : [currentUserId]),
        ...(query.excludeUserIds ?? []),
      ]),
    ];
    const where: Prisma.UserWhereInput = {
      id: { notIn: excludedUserIds },
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: "insensitive" } },
              { hostname: { contains: search, mode: "insensitive" } },
              {
                settings: {
                  is: {
                    nickname: { contains: search, mode: "insensitive" },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { email: "asc" },
        skip: (page - 1) * limit,
        take: limit,
        select: userSummarySelect,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: users.map((user) => toUserSummary(user)),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async updateSettings(
    userId: string,
    dto: UpdateUserSettingsDto,
  ): Promise<UserSettings> {
    const ircNickname = this.nullIfBlank(dto.ircNickname);
    if (dto.ircNotificationsEnabled && !ircNickname) {
      throw new AppException(
        ErrorCode.UNKNOWN_ERROR,
        HttpStatus.BAD_REQUEST,
        "IRC nickname is required when IRC notifications are enabled",
      );
    }

    const webhookUrl = this.nullIfBlank(dto.webhookUrl);
    if (dto.webhookNotificationsEnabled && !webhookUrl) {
      throw new AppException(
        ErrorCode.UNKNOWN_ERROR,
        HttpStatus.BAD_REQUEST,
        "Webhook URL is required when webhook notifications are enabled",
      );
    }

    // Refuse right away a target the relay would otherwise drop in silence.
    if (webhookUrl) {
      await this.webhookUrls.assertAllowed(webhookUrl);
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.hostname !== undefined) {
        await tx.user.update({
          where: { id: userId },
          data: { hostname: this.requiredText(dto.hostname) },
        });
      }

      return tx.userSettings.upsert({
        where: { userId },
        update: {
          nickname: this.nullIfBlank(dto.nickname),
          profileImageUrl: this.nullIfBlank(dto.profileImageUrl),
          locale: dto.locale,
          mailNotificationsEnabled: dto.mailNotificationsEnabled,
          ircNotificationsEnabled: dto.ircNotificationsEnabled,
          ircNickname,
          webhookNotificationsEnabled: dto.webhookNotificationsEnabled,
          webhookUrl,
          notificationPreferences: this.notificationPreferencesJson(
            dto.notificationPreferences,
          ),
        },
        create: {
          userId,
          nickname: this.nullIfBlank(dto.nickname),
          profileImageUrl: this.nullIfBlank(dto.profileImageUrl),
          locale: dto.locale,
          mailNotificationsEnabled: dto.mailNotificationsEnabled ?? false,
          ircNotificationsEnabled: dto.ircNotificationsEnabled ?? false,
          ircNickname,
          webhookNotificationsEnabled: dto.webhookNotificationsEnabled ?? false,
          webhookUrl,
          notificationPreferences:
            this.notificationPreferencesJson(dto.notificationPreferences) ?? {},
        },
      });
    });
  }

  private notificationPreferencesJson(
    preferences: UpdateUserSettingsDto["notificationPreferences"],
  ): Prisma.InputJsonObject | undefined {
    if (preferences === undefined) {
      return undefined;
    }

    return JSON.parse(JSON.stringify(preferences)) as Prisma.InputJsonObject;
  }

  async saveProfileImage(
    userId: string,
    file?: UploadedProfileImageFile,
  ): Promise<UserProfileImageResponseDto> {
    this.assertValidProfileImage(file);
    const format = detectImageFormat(file.buffer)!;
    const imageBytes = this.bytesFromBuffer(file.buffer);

    const profileImage = await this.prisma.userProfileImage.upsert({
      where: { userId },
      update: {
        mimeType: format.mimeType,
        sizeBytes: file.size,
        data: imageBytes,
      },
      create: {
        userId,
        mimeType: format.mimeType,
        sizeBytes: file.size,
        data: imageBytes,
      },
      select: {
        userId: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return profileImage;
  }

  async getProfileImage(userId: string): Promise<UserProfileImage> {
    const profileImage = await this.prisma.userProfileImage.findUnique({
      where: { userId },
    });

    if (!profileImage) {
      throw new AppException(
        ErrorCode.PROFILE_IMAGE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        "Profile image not found",
      );
    }

    return profileImage;
  }

  async deleteProfileImage(
    userId: string,
  ): Promise<UserProfileImageRemovalResponseDto> {
    await this.prisma.userProfileImage.deleteMany({ where: { userId } });
    return { userId, removed: true };
  }

  private assertValidProfileImage(
    file?: UploadedProfileImageFile,
  ): asserts file is UploadedProfileImageFile {
    if (!file) {
      throw new AppException(
        ErrorCode.INVALID_PROFILE_IMAGE,
        HttpStatus.BAD_REQUEST,
        "Profile image file is required",
      );
    }

    // The type comes from the bytes, never from the multipart header, which the
    // client chooses freely.
    if (!detectImageFormat(file.buffer)) {
      throw new AppException(
        ErrorCode.INVALID_PROFILE_IMAGE,
        HttpStatus.BAD_REQUEST,
        `Profile image must be one of: ${SUPPORTED_IMAGE_MIME_TYPES.join(", ")}`,
      );
    }

    const maxBytes = this.profileImageMaxBytes();
    if (file.size > maxBytes) {
      throw new AppException(
        ErrorCode.PAYLOAD_TOO_LARGE,
        HttpStatus.PAYLOAD_TOO_LARGE,
        `Profile image must be smaller than ${maxBytes} bytes`,
      );
    }
  }

  private profileImageMaxBytes(): number {
    return profileImageMaxBytesFromValue(
      this.config.get<string>("PROFILE_IMAGE_MAX_BYTES"),
    );
  }

  private bytesFromBuffer(buffer: Buffer): Uint8Array<ArrayBuffer> {
    const bytes = new Uint8Array(buffer.byteLength);
    bytes.set(buffer);
    return bytes;
  }

  private nullIfBlank(value?: string | null): string | null | undefined {
    if (value === undefined) {
      return undefined;
    }

    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private requiredText(value?: string | null): string {
    return value?.trim() ?? "";
  }
}
