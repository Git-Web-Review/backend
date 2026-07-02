import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";

export class CreateReviewFieldValueDto {
  @ApiProperty({ example: "9ad1e3de-a9af-4e2f-8d3d-4d6f6c85439a" })
  @IsUUID("4")
  fieldId!: string;

  @ApiProperty({ example: "https://tracker.example.test/issues/42" })
  @IsString()
  @MaxLength(4000)
  value!: string;
}

export class CreateReviewDto {
  @ApiProperty({
    example: "https://git-web.example.test/project/commit/?id=abc123",
  })
  @IsUrl({ require_tld: false })
  gitwebUrl!: string;

  @ApiPropertyOptional({
    type: [String],
    example: ["9ad1e3de-a9af-4e2f-8d3d-4d6f6c85439a"],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID("4", { each: true })
  reviewerUserIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description:
      "Commit hashes selected for the review (summary links). Defaults to all proposed commits.",
    example: ["a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @Matches(/^[0-9a-f]{7,40}$/i, { each: true })
  commitHashes?: string[];

  @ApiPropertyOptional({ type: [CreateReviewFieldValueDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateReviewFieldValueDto)
  fieldValues?: CreateReviewFieldValueDto[];
}
