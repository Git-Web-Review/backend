import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class CreateReviewCommentDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  commitHash?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  filePath?: string | null;

  @ApiProperty({ example: 42 })
  @IsInt()
  @Min(1)
  lineNumber!: number;

  @ApiProperty({ example: "This should handle the error path too." })
  @IsString()
  @MaxLength(10000)
  message!: string;
}
