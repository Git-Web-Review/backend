import { ApiProperty } from "@nestjs/swagger";
import { ReviewCommitChangeKind, ReviewCommitStatus } from "@prisma/client";
import { ReviewDiffResponseDto } from "./review-diff-file-response.dto";
import { ReviewUserSummaryResponseDto } from "./review-user-summary-response.dto";

export class ReviewCommitAckResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  reviewCommitId!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  acknowledgedAt!: Date;

  @ApiProperty({ type: () => ReviewUserSummaryResponseDto })
  user!: ReviewUserSummaryResponseDto;
}

export class ReviewCommitResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  reviewId!: string;

  @ApiProperty()
  hash!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ enum: ReviewCommitStatus })
  status!: ReviewCommitStatus;

  @ApiProperty()
  position!: number;

  @ApiProperty({ type: String, nullable: true })
  patchId!: string | null;

  @ApiProperty({ enum: ReviewCommitChangeKind, nullable: true })
  changeKind!: ReviewCommitChangeKind | null;

  @ApiProperty()
  signedOffByName!: string;

  @ApiProperty()
  signedOffByEmail!: string;

  @ApiProperty({ type: String, nullable: true })
  fixesHash!: string | null;

  @ApiProperty({ type: String, nullable: true })
  fixesTitle!: string | null;

  @ApiProperty()
  rawMessage!: string;

  @ApiProperty({ type: () => ReviewDiffResponseDto })
  gitDiff!: ReviewDiffResponseDto;

  @ApiProperty({ type: () => [ReviewCommitAckResponseDto] })
  acks!: ReviewCommitAckResponseDto[];

  @ApiProperty()
  createdAt!: Date;
}
