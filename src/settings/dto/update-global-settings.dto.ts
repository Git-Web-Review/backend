import { ApiProperty } from "@nestjs/swagger";
import { ArrayUnique, IsArray, IsString } from "class-validator";

export class UpdateGlobalSettingsDto {
  @ApiProperty({
    example: ["company.tld"],
    description:
      "Allowed email domains for Firebase OAuth users. Empty means unrestricted.",
  })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  allowedOAuthDomains!: string[];
}
