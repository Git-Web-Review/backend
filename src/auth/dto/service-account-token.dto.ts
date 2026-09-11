import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class ServiceAccountTokenDto {
  @ApiProperty({ example: "review-bot" })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  clientId!: string;

  @ApiProperty({ example: "gwr_sk_..." })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  clientSecret!: string;
}
