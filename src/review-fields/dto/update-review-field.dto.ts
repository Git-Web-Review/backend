import { ApiPropertyOptional } from "@nestjs/swagger";
import { ReviewFieldType } from "@prisma/client";
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class UpdateReviewFieldDto {
  @ApiPropertyOptional({ example: "Ticket" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: ReviewFieldType })
  @IsOptional()
  @IsEnum(ReviewFieldType)
  type?: ReviewFieldType;
}
