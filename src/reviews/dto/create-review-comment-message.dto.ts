import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength } from "class-validator";
import { IsPlainText } from "../../common/validators/text.validators";

export class CreateReviewCommentMessageDto {
  @ApiProperty({ example: "Good point, I pushed a fix." })
  @IsString()
  @MaxLength(10000)
  @IsPlainText()
  message!: string;
}
