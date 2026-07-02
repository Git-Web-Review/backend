import { ApiProperty } from "@nestjs/swagger";
import type { ReviewFieldValue } from "@prisma/client";

export class ReviewFieldValueResponseDto implements ReviewFieldValue {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  reviewId!: string;

  @ApiProperty()
  fieldId!: string;

  @ApiProperty()
  value!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
