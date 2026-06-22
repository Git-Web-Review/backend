import { ApiProperty } from "@nestjs/swagger";

export class ReviewUserSummaryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  hostname!: string;

  @ApiProperty({ type: String, nullable: true })
  nickname!: string | null;

  @ApiProperty()
  mailNotificationsEnabled!: boolean;

  @ApiProperty()
  ircNotificationsEnabled!: boolean;

  @ApiProperty()
  hasProfileImage!: boolean;
}
