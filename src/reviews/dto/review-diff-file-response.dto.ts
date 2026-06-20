import { ApiProperty } from "@nestjs/swagger";

export class ReviewDiffFileResponseDto {
  @ApiProperty()
  path!: string;

  @ApiProperty({ type: String, nullable: true })
  oldPath!: string | null;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  additions!: number;

  @ApiProperty()
  deletions!: number;

  @ApiProperty()
  patch!: string;
}

export class ReviewDiffResponseDto {
  @ApiProperty({ type: () => [ReviewDiffFileResponseDto] })
  files!: ReviewDiffFileResponseDto[];
}
