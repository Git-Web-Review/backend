import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { IsPlainText, IsSingleLine } from "../../common/validators/text.validators";

export class AdminTextNotificationDto {
  @ApiPropertyOptional({ type: String, nullable: true, example: "Maintenance" })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  @IsSingleLine()
  title?: string | null;

  @ApiProperty({ example: "Le service sera redemarre a 18h." })
  @IsString()
  @MaxLength(4000)
  @IsPlainText()
  message!: string;
}
