import { ApiProperty } from "@nestjs/swagger";

export class AdminTextNotificationResponseDto {
  @ApiProperty()
  deliveredCount!: number;
}
