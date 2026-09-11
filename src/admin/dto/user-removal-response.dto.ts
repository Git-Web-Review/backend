import { ApiProperty } from "@nestjs/swagger";

export class UserRemovalResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  removed!: boolean;

  @ApiProperty({ description: "Reviews deleted along with the user" })
  deletedReviews!: number;
}
