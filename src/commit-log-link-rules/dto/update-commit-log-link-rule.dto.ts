import { PartialType } from "@nestjs/swagger";
import { CreateCommitLogLinkRuleDto } from "./create-commit-log-link-rule.dto";

export class UpdateCommitLogLinkRuleDto extends PartialType(
  CreateCommitLogLinkRuleDto,
) {}
