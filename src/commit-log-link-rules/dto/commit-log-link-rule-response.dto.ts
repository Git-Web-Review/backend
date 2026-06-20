import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import type { CommitLogLinkRule } from "@prisma/client";

export class CommitLogLinkRuleResponseDto implements CommitLogLinkRule {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  label!: string | null;

  @ApiProperty({ example: "Issue: (?<ISSUE_ID>\\d+)" })
  regex!: string;

  @ApiProperty({
    example: "https://tracker.example.test/issues/${ISSUE_ID}",
  })
  linkTemplate!: string;

  @ApiProperty()
  enabled!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
