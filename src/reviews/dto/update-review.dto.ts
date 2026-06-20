import { ApiPropertyOptional } from "@nestjs/swagger";
import { ReviewStatus } from "@prisma/client";
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";

export class UpdateReviewDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: "net: fix route leak",
  })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  title?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: "Fix route leak when a device route is deleted.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @ApiPropertyOptional({ enum: ReviewStatus })
  @IsOptional()
  @IsEnum(ReviewStatus)
  status?: ReviewStatus;

  @ApiPropertyOptional({
    type: [String],
    example: ["9ad1e3de-a9af-4e2f-8d3d-4d6f6c85439a"],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID("4", { each: true })
  reviewerUserIds?: string[];
}
