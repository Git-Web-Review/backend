import { ApiProperty } from "@nestjs/swagger";
import { UserLocale, type UserSettings } from "@prisma/client";

export class UserSettingsResponseDto implements UserSettings {
  @ApiProperty()
  userId!: string;

  @ApiProperty({ type: String, nullable: true })
  nickname!: string | null;

  @ApiProperty({ type: String, nullable: true })
  profileImageUrl!: string | null;

  @ApiProperty({ enum: UserLocale })
  locale!: UserLocale;

  @ApiProperty()
  mailNotificationsEnabled!: boolean;

  @ApiProperty()
  ircNotificationsEnabled!: boolean;

  @ApiProperty({ type: String, nullable: true })
  ircNickname!: string | null;
}
