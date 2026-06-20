import { ApiProperty } from "@nestjs/swagger";
import type { ReviewCommit } from "@prisma/client";

export class ReviewCommitResponseDto implements ReviewCommit {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  reviewId!: string;

  @ApiProperty()
  hash!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  signedOffByName!: string;

  @ApiProperty()
  signedOffByEmail!: string;

  @ApiProperty({ type: String, nullable: true })
  fixesHash!: string | null;

  @ApiProperty({ type: String, nullable: true })
  fixesTitle!: string | null;

  @ApiProperty()
  rawMessage!: string;

  @ApiProperty()
  createdAt!: Date;
}
