import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateServiceAccountDto {
  @ApiProperty({ example: "Review bot" })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;

  @ApiPropertyOptional({
    example: "review-bot",
    description: "Defaults to a slug derived from the name",
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(/^[a-z0-9][a-z0-9-]*$/, {
    message: "clientId must contain only lowercase letters, digits and dashes",
  })
  clientId?: string;

  @ApiPropertyOptional({
    example: "review-bot@service.internal",
    description: "Defaults to <clientId>@service.internal",
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: "Runs automated reviews on new commits" })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @ApiPropertyOptional({
    default: false,
    description: "Grants the ADMIN role to the user the agent acts as",
  })
  @IsOptional()
  @IsBoolean()
  admin?: boolean;
}
