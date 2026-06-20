import { ApiProperty } from "@nestjs/swagger";
import { ReviewUserSummaryResponseDto } from "./review-user-summary-response.dto";

export class ReviewReviewerResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  reviewId!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  requestedAt!: Date;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  acknowledgedAt!: Date | null;

  @ApiProperty({ type: () => ReviewUserSummaryResponseDto })
  user!: ReviewUserSummaryResponseDto;
}
