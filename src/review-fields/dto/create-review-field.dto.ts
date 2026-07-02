import { ApiProperty } from "@nestjs/swagger";
import { ReviewFieldType } from "@prisma/client";
import { IsEnum, IsString, MaxLength, MinLength } from "class-validator";

export class CreateReviewFieldDto {
  @ApiProperty({ example: "Ticket" })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: ReviewFieldType, example: ReviewFieldType.LINK })
  @IsEnum(ReviewFieldType)
  type!: ReviewFieldType;
}
