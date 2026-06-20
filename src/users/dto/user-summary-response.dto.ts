import { ApiProperty } from "@nestjs/swagger";

export class UserSummaryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  hostname!: string;

  @ApiProperty({ type: String, nullable: true })
  nickname!: string | null;

  @ApiProperty()
  hasProfileImage!: boolean;
}
