import { ApiProperty } from "@nestjs/swagger";

export class UserProfileImageRemovalResponseDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  removed!: boolean;
}
