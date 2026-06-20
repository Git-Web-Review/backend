import { ApiProperty } from "@nestjs/swagger";
import type { GlobalSettings } from "@prisma/client";

export class GlobalSettingsResponseDto implements GlobalSettings {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: [String] })
  allowedOAuthDomains!: string[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
