import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { GitwebUrlRuleKind, type GitwebUrlRule } from "@prisma/client";

export class GitwebUrlRuleResponseDto implements GitwebUrlRule {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  label!: string | null;

  @ApiProperty({ example: "^git://(?<HOSTNAME>[^/]+)/(?<PROJECT>[^#]+)$" })
  regex!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: "git://${HOSTNAME}/${USERNAME}/${PROJECT}",
  })
  remoteTemplate!: string | null;

  @ApiProperty({ enum: GitwebUrlRuleKind })
  linkKind!: GitwebUrlRuleKind;

  @ApiProperty()
  priority!: number;

  @ApiProperty()
  enabled!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
