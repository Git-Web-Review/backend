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
}

export class UpdateUserSettingsDto {
  @ApiPropertyOptional({ type: String, nullable: true, example: "lea" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
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

  @ApiPropertyOptional({ enum: UserLocale, example: UserLocale.FR })
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
  ircNickname?: string | null;

  @ApiPropertyOptional({ type: NotificationPreferencesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationPreferencesDto)
  notificationPreferences?: NotificationPreferencesDto;
}
