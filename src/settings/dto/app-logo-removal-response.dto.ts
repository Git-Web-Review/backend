import { ApiProperty } from "@nestjs/swagger";

export class AppLogoRemovalResponseDto {
  @ApiProperty()
  removed!: boolean;
}
