import { ApiProperty } from "@nestjs/swagger";

export class AdminRemovalResponseDto {
  @ApiProperty()
  email!: string;

  @ApiProperty()
  removed!: boolean;
}
