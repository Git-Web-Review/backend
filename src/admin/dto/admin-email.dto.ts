import { ApiProperty } from "@nestjs/swagger";
import { IsEmail } from "class-validator";

export class AdminEmailDto {
  @ApiProperty({ example: "admin@company.tld" })
  @IsEmail()
  email!: string;
}
