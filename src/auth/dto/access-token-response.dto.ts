import { ApiProperty } from "@nestjs/swagger";

export class AccessTokenResponseDto {
  @ApiProperty({ description: "Internal JWT to send as a bearer token" })
  accessToken!: string;

  @ApiProperty({ example: "Bearer" })
  tokenType!: string;

  @ApiProperty({ description: "Token lifetime in seconds", example: 3600 })
  expiresIn!: number;

  @ApiProperty({ description: "Absolute expiry date of the token" })
  expiresAt!: Date;

  @ApiProperty({ description: "Client id the token was issued to" })
  clientId!: string;

  @ApiProperty({ description: "Id of the user the agent acts as" })
  userId!: string;

  @ApiProperty({ description: "Email of the user the agent acts as" })
  email!: string;
}
