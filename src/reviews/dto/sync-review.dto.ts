import { ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayUnique, IsArray, IsOptional, IsString } from "class-validator";

export class SyncReviewDto {
  @ApiPropertyOptional({
    type: [String],
    description:
      "Hashes of the branch commits to keep in the new version. Defaults to all commits ahead of origin/master.",
    example: ["9fceb02d0ae598e95dc970b74767f19372d61af8"],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  commitHashes?: string[];
}
