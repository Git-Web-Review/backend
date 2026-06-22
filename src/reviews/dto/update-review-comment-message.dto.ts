import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength } from "class-validator";

export class UpdateReviewCommentMessageDto {
  @ApiProperty({ example: "Good point, I pushed a fix." })
  @IsString()
  @MaxLength(10000)
  message!: string;
}
