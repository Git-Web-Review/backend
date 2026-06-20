import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
} from "class-validator";

export class CreateReviewDto {
  @ApiProperty({
    example: "https://git-web.example.test/project/commit/?id=abc123",
  })
  @IsUrl({ require_tld: false })
  gitwebUrl!: string;

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
