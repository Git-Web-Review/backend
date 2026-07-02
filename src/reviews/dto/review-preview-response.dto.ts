import { ApiProperty } from "@nestjs/swagger";
import { ReviewDiffResponseDto } from "./review-diff-file-response.dto";
import { ReviewUserSummaryResponseDto } from "./review-user-summary-response.dto";

export class ReviewPreviewCommitOptionDto {
  @ApiProperty()
  hash!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  authorName!: string;

  @ApiProperty()
  authorEmail!: string;

  @ApiProperty({ type: String, nullable: true })
  authoredAt!: string | null;
}

export class ReviewPreviewResponseDto {
  @ApiProperty()
  gitwebUrl!: string;

  @ApiProperty({ enum: ["COMMIT", "SUMMARY"] })
  linkKind!: "COMMIT" | "SUMMARY";

  @ApiProperty({ type: () => [ReviewPreviewCommitOptionDto] })
  commitOptions!: ReviewPreviewCommitOptionDto[];

  @ApiProperty({ type: String, nullable: true })
  title!: string | null;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ type: String, nullable: true })
  sourceProject!: string | null;

  @ApiProperty({ type: String, nullable: true })
  sourceBranch!: string | null;

  @ApiProperty({ type: String, nullable: true })
  sourceCommit!: string | null;

  @ApiProperty({ type: String, nullable: true })
  gitwebLog!: string | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  gitwebFetchedAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  gitwebFetchError!: string | null;

  @ApiProperty({ type: [String] })
  reviewerEmails!: string[];

  @ApiProperty({ type: () => [ReviewUserSummaryResponseDto] })
  reviewerUsers!: ReviewUserSummaryResponseDto[];

  @ApiProperty({ type: () => ReviewDiffResponseDto })
  gitDiff!: ReviewDiffResponseDto;
}
