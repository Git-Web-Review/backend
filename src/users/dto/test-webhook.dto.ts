import { ApiProperty } from "@nestjs/swagger";
import { IsUrl, MaxLength } from "class-validator";

export class TestWebhookDto {
  @ApiProperty({ example: "https://hooks.company.tld/git-web-review" })
  @IsUrl({
    require_tld: false,
    require_protocol: true,
    protocols: ["http", "https"],
  })
  @MaxLength(2048)
  webhookUrl!: string;
}
