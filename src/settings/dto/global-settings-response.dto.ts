import { ApiProperty } from "@nestjs/swagger";
import type { GlobalSettings } from "@prisma/client";

export class GlobalSettingsResponseDto implements GlobalSettings {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: [String] })
  allowedOAuthDomains!: string[];

  @ApiProperty()
  notificationPurgeEnabled!: boolean;

  @ApiProperty()
  notificationPurgeIntervalMinutes!: number;

  @ApiProperty()
  notificationPurgeAfterDays!: number;

  @ApiProperty()
  reviewAutoCloseEnabled!: boolean;

  @ApiProperty()
  reviewAutoCloseIntervalMinutes!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
