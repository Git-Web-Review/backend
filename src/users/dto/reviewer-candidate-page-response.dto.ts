import { ApiProperty } from "@nestjs/swagger";
import { UserSummaryResponseDto } from "./user-summary-response.dto";

export class ReviewerCandidatePageResponseDto {
  @ApiProperty({ type: [UserSummaryResponseDto] })
  items!: UserSummaryResponseDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  totalPages!: number;
}
