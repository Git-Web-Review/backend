import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import { ReviewCommentSide } from "@prisma/client";

export class CreateReviewCommentDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  commitHash?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  filePath?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, example: 42 })
  @IsOptional()
  @IsInt()
  @Min(1)
  lineNumber?: number | null;

  @ApiPropertyOptional({ enum: ReviewCommentSide })
  @IsOptional()
  @IsEnum(ReviewCommentSide)
  side?: ReviewCommentSide;

  @ApiProperty({ example: "This should handle the error path too." })
  @IsString()
  @MaxLength(10000)
  message!: string;
}
