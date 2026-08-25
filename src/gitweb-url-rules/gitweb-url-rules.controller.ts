import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { User, UserRole } from "@prisma/client";
import { AdminGuard } from "../auth/admin.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { FirebaseAuthGuard } from "../auth/firebase-auth.guard";
import {
  ApiAdminErrorResponses,
  ApiAuthErrorResponses,
  ApiValidationErrorResponse,
} from "../common/swagger/api-error-responses";
import { CreateGitwebUrlRuleDto } from "./dto/create-gitweb-url-rule.dto";
import { GitwebUrlRuleResponseDto } from "./dto/gitweb-url-rule-response.dto";
import { UpdateGitwebUrlRuleDto } from "./dto/update-gitweb-url-rule.dto";
import { GitwebUrlRulesService } from "./gitweb-url-rules.service";

@ApiTags("gitweb-url-rules")
@ApiBearerAuth()
@ApiAuthErrorResponses()
@UseGuards(FirebaseAuthGuard)
@Controller("v1/gitweb-url-rules")
export class GitwebUrlRulesController {
  constructor(private readonly rulesService: GitwebUrlRulesService) {}

  @Get()
  @ApiOperation({ summary: "List git-web URL parsing rules" })
  @ApiOkResponse({
    description: "Git-web URL rules returned",
    type: [GitwebUrlRuleResponseDto],
  })
  list(@CurrentUser() user: User): Promise<GitwebUrlRuleResponseDto[]> {
    return this.rulesService.list(user.role === UserRole.ADMIN);
  }

  @Post()
  @UseGuards(AdminGuard)
  @ApiAdminErrorResponses()
  @ApiOperation({ summary: "Create a git-web URL parsing rule" })
  @ApiCreatedResponse({
    description: "Git-web URL rule created",
    type: GitwebUrlRuleResponseDto,
  })
  @ApiValidationErrorResponse()
  create(
    @Body() dto: CreateGitwebUrlRuleDto,
  ): Promise<GitwebUrlRuleResponseDto> {
    return this.rulesService.create(dto);
  }

  @Patch(":id")
  @UseGuards(AdminGuard)
  @ApiAdminErrorResponses()
  @ApiOperation({ summary: "Update a git-web URL parsing rule" })
  @ApiOkResponse({
    description: "Git-web URL rule updated",
    type: GitwebUrlRuleResponseDto,
  })
  @ApiValidationErrorResponse()
  update(
    @Param("id") id: string,
    @Body() dto: UpdateGitwebUrlRuleDto,
  ): Promise<GitwebUrlRuleResponseDto> {
    return this.rulesService.update(id, dto);
  }

  @Delete(":id")
  @UseGuards(AdminGuard)
  @ApiAdminErrorResponses()
  @ApiOperation({ summary: "Delete a git-web URL parsing rule" })
  @ApiOkResponse({ description: "Git-web URL rule deleted" })
  delete(@Param("id") id: string): Promise<{ id: string; deleted: boolean }> {
    return this.rulesService.delete(id);
  }
}
