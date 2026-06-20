import { ApiProperty } from "@nestjs/swagger";
import { Prisma, ReviewStatus, type Review } from "@prisma/client";
import { ReviewCommitResponseDto } from "./review-commit-response.dto";
import { ReviewDiffResponseDto } from "./review-diff-file-response.dto";
import { ReviewReviewerResponseDto } from "./review-reviewer-response.dto";
import { ReviewUserSummaryResponseDto } from "./review-user-summary-response.dto";

export class ReviewResponseDto implements Review {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  gitwebUrl!: string;

  @ApiProperty({ type: String, nullable: true })
  title!: string | null;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ enum: ReviewStatus })
  status!: ReviewStatus;

  @ApiProperty()
  ownerId!: string;

  @ApiProperty({ type: () => ReviewUserSummaryResponseDto })
  owner!: ReviewUserSummaryResponseDto;

  @ApiProperty({ type: String, nullable: true })
  sourceProject!: string | null;

  @ApiProperty({ type: String, nullable: true })
  sourceBranch!: string | null;

  @ApiProperty({ type: String, nullable: true })
  sourceCommit!: string | null;

  @ApiProperty({ type: String, nullable: true })
  gitwebTitle!: string | null;

  @ApiProperty({ type: String, nullable: true })
  gitwebLog!: string | null;

  @ApiProperty({ type: String, nullable: true })
  gitwebRawHtml!: string | null;

  @ApiProperty({ type: Object, nullable: true })
  gitwebSnapshot!: Prisma.JsonValue | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  gitwebFetchedAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  gitwebFetchError!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty({ type: () => [ReviewCommitResponseDto] })
  commits!: ReviewCommitResponseDto[];

  @ApiProperty({ type: () => [ReviewReviewerResponseDto] })
  reviewers!: ReviewReviewerResponseDto[];

  @ApiProperty({ type: () => ReviewDiffResponseDto })
  gitDiff!: ReviewDiffResponseDto;
}
