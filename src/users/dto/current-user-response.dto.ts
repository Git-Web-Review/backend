import { ApiProperty } from "@nestjs/swagger";
import { UserRole, type User } from "@prisma/client";
import { UserProfileImageResponseDto } from "./user-profile-image-response.dto";
import { UserSettingsResponseDto } from "./user-settings-response.dto";

export class CurrentUserResponseDto implements User {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  firebaseUid!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  hostname!: string;

  @ApiProperty({ enum: UserRole })
  role!: UserRole;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty({ type: () => UserSettingsResponseDto, nullable: true })
  settings!: UserSettingsResponseDto | null;

  @ApiProperty({ type: () => UserProfileImageResponseDto, nullable: true })
  profileImage!: UserProfileImageResponseDto | null;
}
