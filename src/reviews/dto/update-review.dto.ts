import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";

export class UpdateReviewDto {
  @ApiPropertyOptional({
    type: [String],
    example: ["9ad1e3de-a9af-4e2f-8d3d-4d6f6c85439a"],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID("4", { each: true })
  reviewerUserIds?: string[];

  @ApiPropertyOptional({ example: "Add VLAN support to vrouter" })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  title?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: "Covers both the daemon and the CLI side.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;
}
