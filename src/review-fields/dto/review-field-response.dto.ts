import { ApiProperty } from "@nestjs/swagger";
import { ReviewFieldType, type ReviewFieldDefinition } from "@prisma/client";

export class ReviewFieldResponseDto implements ReviewFieldDefinition {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: "Ticket" })
  name!: string;

  @ApiProperty({ enum: ReviewFieldType })
  type!: ReviewFieldType;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
