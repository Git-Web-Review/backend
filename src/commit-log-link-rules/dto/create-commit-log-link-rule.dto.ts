import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateCommitLogLinkRuleDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: "Issue tracker",
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string | null;

  @ApiProperty({ example: "Issue: (?<ISSUE_ID>\\d+)" })
  @IsString()
  @MaxLength(1000)
  regex!: string;

  @ApiProperty({
    example: "https://tracker.example.test/issues/${ISSUE_ID}",
  })
  @IsString()
  @MaxLength(2000)
  linkTemplate!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
