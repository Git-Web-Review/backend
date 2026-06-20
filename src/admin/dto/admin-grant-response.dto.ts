import { ApiProperty } from "@nestjs/swagger";
import type { AdminGrant } from "@prisma/client";

export class AdminGrantResponseDto implements AdminGrant {
  @ApiProperty()
  email!: string;

  @ApiProperty()
  createdAt!: Date;
}
