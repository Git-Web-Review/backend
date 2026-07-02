import { ApiProperty } from "@nestjs/swagger";
import { ReviewCommitChangeKind } from "@prisma/client";

export class ReviewSyncCommitPreviewDto {
  @ApiProperty()
  hash!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ enum: ReviewCommitChangeKind })
  changeKind!: ReviewCommitChangeKind;

  @ApiProperty({ type: String, nullable: true })
  previousHash!: string | null;

  @ApiProperty({ type: String, nullable: true })
  previousTitle!: string | null;

  @ApiProperty()
  authorName!: string;

  @ApiProperty({ type: String, nullable: true })
  authoredAt!: string | null;
}

export class ReviewSyncDroppedCommitPreviewDto {
  @ApiProperty()
  hash!: string;

  @ApiProperty()
  title!: string;
}

export class ReviewSyncPreviewResponseDto {
  @ApiProperty()
  reviewId!: string;

  @ApiProperty({ description: "Current review version" })
  version!: number;

  @ApiProperty({ type: String, nullable: true })
  sourceBranch!: string | null;

  @ApiProperty({ description: "True when applying would change the review" })
  hasChanges!: boolean;

  @ApiProperty({ type: () => [ReviewSyncCommitPreviewDto] })
  commits!: ReviewSyncCommitPreviewDto[];

  @ApiProperty({ type: () => [ReviewSyncDroppedCommitPreviewDto] })
  droppedCommits!: ReviewSyncDroppedCommitPreviewDto[];
}
