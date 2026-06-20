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
import { CommitLogLinkRulesService } from "./commit-log-link-rules.service";
import { CommitLogLinkRuleResponseDto } from "./dto/commit-log-link-rule-response.dto";
import { CreateCommitLogLinkRuleDto } from "./dto/create-commit-log-link-rule.dto";
import { UpdateCommitLogLinkRuleDto } from "./dto/update-commit-log-link-rule.dto";

@ApiTags("commit-log-link-rules")
@ApiBearerAuth()
@ApiAuthErrorResponses()
@UseGuards(FirebaseAuthGuard)
@Controller("v1/commit-log-link-rules")
export class CommitLogLinkRulesController {
  constructor(private readonly rulesService: CommitLogLinkRulesService) {}

  @Get()
  @ApiOperation({ summary: "List commit log link rules" })
  @ApiOkResponse({
    description: "Commit log link rules returned",
    type: [CommitLogLinkRuleResponseDto],
  })
  list(@CurrentUser() user: User): Promise<CommitLogLinkRuleResponseDto[]> {
    return this.rulesService.list(user.role === UserRole.ADMIN);
  }

  @Post()
  @UseGuards(AdminGuard)
  @ApiAdminErrorResponses()
  @ApiOperation({ summary: "Create a commit log link rule" })
  @ApiCreatedResponse({
    description: "Commit log link rule created",
    type: CommitLogLinkRuleResponseDto,
  })
  @ApiValidationErrorResponse()
  create(
    @Body() dto: CreateCommitLogLinkRuleDto,
  ): Promise<CommitLogLinkRuleResponseDto> {
    return this.rulesService.create(dto);
  }

  @Patch(":id")
  @UseGuards(AdminGuard)
  @ApiAdminErrorResponses()
  @ApiOperation({ summary: "Update a commit log link rule" })
  @ApiOkResponse({
    description: "Commit log link rule updated",
    type: CommitLogLinkRuleResponseDto,
  })
  @ApiValidationErrorResponse()
  update(
    @Param("id") id: string,
    @Body() dto: UpdateCommitLogLinkRuleDto,
  ): Promise<CommitLogLinkRuleResponseDto> {
    return this.rulesService.update(id, dto);
  }

  @Delete(":id")
  @UseGuards(AdminGuard)
  @ApiAdminErrorResponses()
  @ApiOperation({ summary: "Delete a commit log link rule" })
  @ApiOkResponse({ description: "Commit log link rule deleted" })
  delete(@Param("id") id: string): Promise<{ id: string; deleted: boolean }> {
    return this.rulesService.delete(id);
  }
}
