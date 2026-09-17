import { ApiProperty } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";
import { IsSingleLine } from "../../common/validators/text.validators";

export class AddProjectDefaultReviewersDto {
  @ApiProperty({
    description:
      'Repository name. A "<user>/" namespace and a ".git" suffix are stripped.',
    example: "vrouter",
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @IsSingleLine()
  project!: string;

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
