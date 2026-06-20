import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";

export class AdminTextNotificationDto {
  @ApiPropertyOptional({ type: String, nullable: true, example: "Maintenance" })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string | null;

  @ApiProperty({ example: "Le service sera redemarre a 18h." })
  @IsString()
  @MaxLength(4000)
  message!: string;
}
