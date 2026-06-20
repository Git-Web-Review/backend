import { ApiProperty } from "@nestjs/swagger";
import { IsUrl } from "class-validator";

export class PreviewReviewDto {
  @ApiProperty({
    example: "https://git-web.example.test/project/commit/?id=abc123",
  })
  @IsUrl({ require_tld: false })
  gitwebUrl!: string;
}
