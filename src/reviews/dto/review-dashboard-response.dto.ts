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

export class ReviewDashboardProjectPageResponseDto extends ReviewDashboardPageResponseDto {
  @ApiProperty({ example: "vrouter" })
  project!: string;
}

export class ReviewDashboardResponseDto {
  @ApiProperty({ type: () => ReviewDashboardPageResponseDto })
  owned!: ReviewDashboardPageResponseDto;

  @ApiProperty({ type: () => ReviewDashboardPageResponseDto })
  assigned!: ReviewDashboardPageResponseDto;

  @ApiProperty({ type: () => ReviewDashboardPageResponseDto })
  done!: ReviewDashboardPageResponseDto;

  @ApiProperty({
    type: () => [ReviewDashboardProjectPageResponseDto],
    description:
      "One list per project the caller owns, sorted by project name: the reviews of the project, open or closed, the caller neither created nor reviews.",
  })
  projects!: ReviewDashboardProjectPageResponseDto[];
}
