import { ApiProperty } from "@nestjs/swagger";

export class UserProfileImageResponseDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty({ example: "image/png" })
  mimeType!: string;

  @ApiProperty()
  sizeBytes!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
