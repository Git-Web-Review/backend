import { PartialType } from "@nestjs/swagger";
import { CreateGitwebUrlRuleDto } from "./create-gitweb-url-rule.dto";

export class UpdateGitwebUrlRuleDto extends PartialType(
  CreateGitwebUrlRuleDto,
) {}
