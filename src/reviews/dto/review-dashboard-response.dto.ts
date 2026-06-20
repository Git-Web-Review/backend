import { ApiProperty } from "@nestjs/swagger";
import { ReviewResponseDto } from "./review-response.dto";

export class ReviewDashboardPageResponseDto {
  @ApiProperty({ type: () => [ReviewResponseDto] })
  items!: ReviewResponseDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  totalPages!: number;
}

export class ReviewDashboardResponseDto {
  @ApiProperty({ type: () => ReviewDashboardPageResponseDto })
  owned!: ReviewDashboardPageResponseDto;

  @ApiProperty({ type: () => ReviewDashboardPageResponseDto })
  assigned!: ReviewDashboardPageResponseDto;

  @ApiProperty({ type: () => ReviewDashboardPageResponseDto })
  done!: ReviewDashboardPageResponseDto;
}
