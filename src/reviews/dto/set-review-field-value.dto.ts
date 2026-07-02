import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, ValidateIf } from "class-validator";

export class SetReviewFieldValueDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description: "Field value. Blank or null clears the value.",
    example: "https://tracker.example.test/issues/42",
  })
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(4000)
  value!: string | null;
}
