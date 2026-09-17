import { ApiProperty } from "@nestjs/swagger";
import { UserSummaryResponseDto } from "../../users/dto/user-summary-response.dto";

export class ProjectDefaultReviewerResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: "vrouter" })
  project!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ type: () => UserSummaryResponseDto })
  user!: UserSummaryResponseDto;

  @ApiProperty()
  createdAt!: Date;
}
