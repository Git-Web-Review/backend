import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class UpdateServiceAccountDto {
  @ApiPropertyOptional({ example: "Review bot" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name?: string;

  @ApiPropertyOptional({ example: "Runs automated reviews on new commits" })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @ApiPropertyOptional({
    description: "Disabled accounts can no longer obtain or use a token",
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
