import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { NotificationType } from "@prisma/client";
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { IsPlainText } from "../../common/validators/text.validators";
import { NOTIFICATION_FORMAT_MAX_LENGTH } from "./update-user-settings.dto";

export class TestNotificationFormatDto {
  @ApiProperty({ enum: ["irc", "mail"], example: "irc" })
  @IsIn(["irc", "mail"])
  medium!: "irc" | "mail";

  @ApiProperty({ enum: NotificationType, example: NotificationType.TEXT })
  @IsEnum(NotificationType)
  type!: NotificationType;

  @ApiPropertyOptional({
    description: "Format to try, saved or not; empty for the default template.",
    example: "%t by %a %u",
  })
  @IsOptional()
  @IsString()
  @MaxLength(NOTIFICATION_FORMAT_MAX_LENGTH)
  @IsPlainText()
  format?: string;
}
