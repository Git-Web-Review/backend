import { ApiPropertyOptional } from "@nestjs/swagger";
import { UserLocale } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from "class-validator";
import {
  IsIrcTarget,
  IsPlainText,
  IsSingleLine,
} from "../../common/validators/text.validators";

export class NotificationMediumPreferencesDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  reviewStarted?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  reviewPending?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  reviewDone?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  reviewAcked?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  reviewClosed?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  commentReceived?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  commentMention?: boolean;
}

export class NotificationPreferencesDto {
  @ApiPropertyOptional({ type: NotificationMediumPreferencesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationMediumPreferencesDto)
  mail?: NotificationMediumPreferencesDto;

  @ApiPropertyOptional({ type: NotificationMediumPreferencesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationMediumPreferencesDto)
  irc?: NotificationMediumPreferencesDto;

  @ApiPropertyOptional({ type: NotificationMediumPreferencesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationMediumPreferencesDto)
  webhook?: NotificationMediumPreferencesDto;
}

const NOTIFICATION_FORMAT_MAX_LENGTH = 500;

/** printf-style formats, one per notification type; see the relays. */
export class NotificationTypeFormatsDto {
  @ApiPropertyOptional({ example: "%t by %a %u" })
  @IsOptional()
  @IsString()
  @MaxLength(NOTIFICATION_FORMAT_MAX_LENGTH)
  @IsPlainText()
  TEXT?: string;

  @ApiPropertyOptional({ example: "%t by %a %u" })
  @IsOptional()
  @IsString()
  @MaxLength(NOTIFICATION_FORMAT_MAX_LENGTH)
  @IsPlainText()
  REVIEW_PENDING?: string;

  @ApiPropertyOptional({ example: "%t by %a %u" })
  @IsOptional()
  @IsString()
  @MaxLength(NOTIFICATION_FORMAT_MAX_LENGTH)
  @IsPlainText()
  REVIEW_STATUS_CHANGED?: string;

  @ApiPropertyOptional({ example: "%t by %a %u" })
  @IsOptional()
  @IsString()
  @MaxLength(NOTIFICATION_FORMAT_MAX_LENGTH)
  @IsPlainText()
  COMMENT_RECEIVED?: string;

  @ApiPropertyOptional({ example: "%t by %a %u" })
  @IsOptional()
  @IsString()
  @MaxLength(NOTIFICATION_FORMAT_MAX_LENGTH)
  @IsPlainText()
  COMMENT_MENTION?: string;

  @ApiPropertyOptional({ example: "%t by %a %u" })
  @IsOptional()
  @IsString()
  @MaxLength(NOTIFICATION_FORMAT_MAX_LENGTH)
  @IsPlainText()
  COMMIT_REVIEWED?: string;

  @ApiPropertyOptional({ example: "%t by %a %u" })
  @IsOptional()
  @IsString()
  @MaxLength(NOTIFICATION_FORMAT_MAX_LENGTH)
  @IsPlainText()
  REVIEW_NEW_VERSION?: string;
}

export class NotificationFormatsDto {
  @ApiPropertyOptional({ type: NotificationTypeFormatsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationTypeFormatsDto)
  irc?: NotificationTypeFormatsDto;

  @ApiPropertyOptional({ type: NotificationTypeFormatsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationTypeFormatsDto)
  mail?: NotificationTypeFormatsDto;
}

export class UpdateUserSettingsDto {
  @ApiPropertyOptional({ type: String, nullable: true, example: "lea" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @IsSingleLine()
  nickname?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: "leandre-laptop",
    description: "User-provided machine hostname.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(253)
  hostname?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: "https://example.test/avatar.png",
  })
  @IsOptional()
  @IsUrl({ require_tld: false })
  profileImageUrl?: string | null;

  @ApiPropertyOptional({
    enum: UserLocale,
    enumName: "UserLocale",
    example: UserLocale.FR,
  })
  @IsOptional()
  @IsEnum(UserLocale)
  locale?: UserLocale;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  mailNotificationsEnabled?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  ircNotificationsEnabled?: boolean;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: "leandre",
    description: "Required when IRC notifications are enabled.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @IsIrcTarget()
  ircNickname?: string | null;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  webhookNotificationsEnabled?: boolean;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: "https://chat.company.tld/hooks/abc123",
    description:
      "Endpoint the http-relay posts to. Required when webhook notifications are enabled.",
  })
  @IsOptional()
  @IsUrl({
    require_tld: false,
    require_protocol: true,
    protocols: ["http", "https"],
  })
  @MaxLength(2048)
  webhookUrl?: string | null;

  @ApiPropertyOptional({ type: NotificationPreferencesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationPreferencesDto)
  notificationPreferences?: NotificationPreferencesDto;

  @ApiPropertyOptional({ type: NotificationFormatsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationFormatsDto)
  notificationFormats?: NotificationFormatsDto;
}
