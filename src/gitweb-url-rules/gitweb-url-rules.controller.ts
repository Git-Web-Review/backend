import { Body, Delete, Get, Patch, Post } from "@nestjs/common";
import { User, UserRole } from "@prisma/client";
import {
  ApiAdminOnly,
  ApiAuthenticatedController,
} from "../auth/api-controller.decorators";
import { CurrentUser } from "../auth/current-user.decorator";
import { DeletionResponseDto } from "../common/dto/deletion-response.dto";
import { ApiEndpoint, ApiTag, UuidParam } from "../common/swagger";
import { CreateGitwebUrlRuleDto } from "./dto/create-gitweb-url-rule.dto";
import { GitwebUrlRuleResponseDto } from "./dto/gitweb-url-rule-response.dto";
import { UpdateGitwebUrlRuleDto } from "./dto/update-gitweb-url-rule.dto";
import { GitwebUrlRulesService } from "./gitweb-url-rules.service";

/** Every signed-in user reads the rules; only admins change them. */
@ApiAuthenticatedController(ApiTag.GitwebUrlRules, "v1/gitweb-url-rules")
export class GitwebUrlRulesController {
  constructor(private readonly rulesService: GitwebUrlRulesService) {}

  @Get()
  @ApiEndpoint({
    summary: "List git-web URL parsing rules",
    description:
      "Rules are tried in order until one matches the submitted link. Admins additionally see the built-in rules and the inactive ones.",
    response: "Git-web URL rules returned",
    type: [GitwebUrlRuleResponseDto],
  })
  list(@CurrentUser() user: User): Promise<GitwebUrlRuleResponseDto[]> {
    return this.rulesService.list(user.role === UserRole.ADMIN);
  }

  @Post()
  @ApiAdminOnly()
  @ApiEndpoint({
    summary: "Create a git-web URL parsing rule",
    response: "Git-web URL rule created",
    type: GitwebUrlRuleResponseDto,
    created: true,
    validation: true,
  })
  create(
    @Body() dto: CreateGitwebUrlRuleDto,
  ): Promise<GitwebUrlRuleResponseDto> {
    return this.rulesService.create(dto);
  }

  @Patch(":id")
  @ApiAdminOnly()
  @ApiEndpoint({
    summary: "Update a git-web URL parsing rule",
    response: "Git-web URL rule updated",
    type: GitwebUrlRuleResponseDto,
    validation: true,
    notFound: true,
  })
  update(
    @UuidParam("id", "Git-web URL rule identifier") id: string,
    @Body() dto: UpdateGitwebUrlRuleDto,
  ): Promise<GitwebUrlRuleResponseDto> {
    return this.rulesService.update(id, dto);
  }

  @Delete(":id")
  @ApiAdminOnly()
  @ApiEndpoint({
    summary: "Delete a git-web URL parsing rule",
    description: "Reviews already created through the rule are untouched.",
    response: "Git-web URL rule deleted",
    type: DeletionResponseDto,
    notFound: true,
  })
  delete(
    @UuidParam("id", "Git-web URL rule identifier") id: string,
  ): Promise<DeletionResponseDto> {
    return this.rulesService.delete(id);
  }
}
