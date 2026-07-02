import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export class UpdateGlobalSettingsDto {
  @ApiPropertyOptional({
    example: ["company.tld"],
    description:
      "Allowed email domains for Firebase OAuth users. Empty means unrestricted.",
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  allowedOAuthDomains?: string[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  notificationPurgeEnabled?: boolean;

  @ApiPropertyOptional({ example: 60 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10080)
  notificationPurgeIntervalMinutes?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  notificationPurgeAfterDays?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  reviewAutoCloseEnabled?: boolean;

  @ApiPropertyOptional({ example: 60 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10080)
  reviewAutoCloseIntervalMinutes?: number;
}
