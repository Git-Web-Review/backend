import { ApiProperty } from "@nestjs/swagger";
import { ReviewCommentSide } from "@prisma/client";
import { ReviewUserSummaryResponseDto } from "./review-user-summary-response.dto";

export class ReviewCommentResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  commentId!: string;

  @ApiProperty()
  reviewId!: string;

  @ApiProperty({ type: String, nullable: true })
  commitHash!: string | null;

  @ApiProperty({ type: String, nullable: true })
  filePath!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  lineNumber!: number | null;

  @ApiProperty({ enum: ReviewCommentSide, enumName: "ReviewCommentSide" })
  side!: ReviewCommentSide;

  @ApiProperty({ type: () => ReviewUserSummaryResponseDto })
  author!: ReviewUserSummaryResponseDto;

  @ApiProperty()
  done!: boolean;

  @ApiProperty({ type: () => ReviewUserSummaryResponseDto, nullable: true })
  doneBy!: ReviewUserSummaryResponseDto | null;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  doneAt!: Date | null;

  @ApiProperty({
    description:
      "Markdown text. A mention is written `@<user id>`; its user is listed in `mentions`.",
  })
  message!: string;

  @ApiProperty({
    type: () => [ReviewUserSummaryResponseDto],
    description:
      "Users the message mentions, in order of first mention. An id matching no user is left out.",
  })
  mentions!: ReviewUserSummaryResponseDto[];

  @ApiProperty()
  createdAt!: Date;
}
