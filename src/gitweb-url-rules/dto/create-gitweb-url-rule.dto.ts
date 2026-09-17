import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { GitwebUrlRuleKind } from "@prisma/client";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class CreateGitwebUrlRuleDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: "gitweb query - commitdiff",
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string | null;

  @ApiProperty({
    example:
      "^https?://(?<HOSTNAME>[^/?#]+)(?=[^#]*[?;&]p=(?<PROJECT>[^;&#]+))(?=[^#]*[?;&]a=commitdiff([;&#]|$))(?=[^#]*[?;&]h=(?<COMMIT_HASH>[0-9a-f]{7,40}))",
  })
  @IsString()
  @MaxLength(2000)
  regex!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      "Template of the git remote URL. Variables: ${HOSTNAME}, ${PROJECT} (repository name), ${USERNAME} (owner), ${COMPONENT}, plus any named group. Defaults to git://${HOSTNAME}/${USERNAME}/${PROJECT}.",
    example: "git://${HOSTNAME}/${USERNAME}/${PROJECT}",
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remoteTemplate?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      "Template of the gitweb project page, used for file and line links when the review URL is not a gitweb page (e.g. a git:// remote). Same variables as remoteTemplate. Must render an http(s) URL.",
    example: "http://${HOSTNAME}/git/?p=${USERNAME}/${PROJECT}.git",
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  webTemplate?: string | null;

  @ApiPropertyOptional({
    enum: GitwebUrlRuleKind, enumName: "GitwebUrlRuleKind",
    default: GitwebUrlRuleKind.AUTO,
    description:
      "COMMIT or SUMMARY, or AUTO to resolve from the presence of a COMMIT_HASH group.",
  })
  @IsOptional()
  @IsEnum(GitwebUrlRuleKind)
  linkKind?: GitwebUrlRuleKind;

  @ApiPropertyOptional({
    default: 100,
    description: "Rules are tried in ascending priority order.",
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000000)
  priority?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
