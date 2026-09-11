import { ApiProperty } from "@nestjs/swagger";

export class AppLogoResponseDto {
  @ApiProperty({ example: "image/png" })
  mimeType!: string;

  @ApiProperty()
  sizeBytes!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
