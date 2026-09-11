import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";

export class ServiceAccountResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: "Identifier sent to POST /v1/auth/token" })
  clientId!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty()
  active!: boolean;

  @ApiPropertyOptional({ type: Date, nullable: true })
  lastUsedAt!: Date | null;

  @ApiProperty({ description: "Id of the user the agent acts as" })
  userId!: string;

  @ApiProperty({ description: "Email of the user the agent acts as" })
  email!: string;

  @ApiProperty({ enum: UserRole, enumName: "UserRole" })
  role!: UserRole;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class ServiceAccountSecretResponseDto extends ServiceAccountResponseDto {
  @ApiProperty({
    description: "Plaintext secret, returned only once at creation or rotation",
  })
  clientSecret!: string;
}

export class ServiceAccountRemovalResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  removed!: boolean;
}
