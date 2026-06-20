import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean } from "class-validator";

export class UpdateReviewCommentDto {
  @ApiProperty()
  @IsBoolean()
  done!: boolean;
}
