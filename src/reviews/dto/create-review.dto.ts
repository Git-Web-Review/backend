import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsUrl,
  IsUUID,
} from "class-validator";

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
}
