import { ApiProperty } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsUUID,
} from "class-validator";

export class AddReviewReviewersDto {
  @ApiProperty({
    type: [String],
    example: ["9ad1e3de-a9af-4e2f-8d3d-4d6f6c85439a"],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID("4", { each: true })
  userIds!: string[];
}
