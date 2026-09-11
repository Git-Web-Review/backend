import { Body, Delete, Get, Patch, Post } from "@nestjs/common";
import { User, UserRole } from "@prisma/client";
import {
  ApiAdminOnly,
  ApiAuthenticatedController,
} from "../auth/api-controller.decorators";
import { CurrentUser } from "../auth/current-user.decorator";
import { DeletionResponseDto } from "../common/dto/deletion-response.dto";
import { ApiEndpoint, ApiTag, UuidParam } from "../common/swagger";
import { CommitLogLinkRulesService } from "./commit-log-link-rules.service";
import { CommitLogLinkRuleResponseDto } from "./dto/commit-log-link-rule-response.dto";
import { CreateCommitLogLinkRuleDto } from "./dto/create-commit-log-link-rule.dto";
import { UpdateCommitLogLinkRuleDto } from "./dto/update-commit-log-link-rule.dto";

/** Every signed-in user reads the rules; only admins change them. */
@ApiAuthenticatedController(
  ApiTag.CommitLogLinkRules,
  "v1/commit-log-link-rules",
)
export class CommitLogLinkRulesController {
  constructor(private readonly rulesService: CommitLogLinkRulesService) {}

  @Get()
  @ApiEndpoint({
    summary: "List commit log link rules",
    description:
      "Patterns that turn references found in a commit message into links. Admins additionally see the inactive ones.",
    response: "Commit log link rules returned",
    type: [CommitLogLinkRuleResponseDto],
  })
  list(@CurrentUser() user: User): Promise<CommitLogLinkRuleResponseDto[]> {
    return this.rulesService.list(user.role === UserRole.ADMIN);
  }

  @Post()
  @ApiAdminOnly()
  @ApiEndpoint({
    summary: "Create a commit log link rule",
    response: "Commit log link rule created",
    type: CommitLogLinkRuleResponseDto,
    created: true,
    validation: true,
  })
  create(
    @Body() dto: CreateCommitLogLinkRuleDto,
  ): Promise<CommitLogLinkRuleResponseDto> {
    return this.rulesService.create(dto);
  }

  @Patch(":id")
  @ApiAdminOnly()
  @ApiEndpoint({
    summary: "Update a commit log link rule",
    response: "Commit log link rule updated",
    type: CommitLogLinkRuleResponseDto,
    validation: true,
    notFound: true,
  })
  update(
    @UuidParam("id", "Commit log link rule identifier") id: string,
    @Body() dto: UpdateCommitLogLinkRuleDto,
  ): Promise<CommitLogLinkRuleResponseDto> {
    return this.rulesService.update(id, dto);
  }

  @Delete(":id")
  @ApiAdminOnly()
  @ApiEndpoint({
    summary: "Delete a commit log link rule",
    response: "Commit log link rule deleted",
    type: DeletionResponseDto,
    notFound: true,
  })
  delete(
    @UuidParam("id", "Commit log link rule identifier") id: string,
  ): Promise<DeletionResponseDto> {
    return this.rulesService.delete(id);
  }
}
