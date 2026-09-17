import { Body, Delete, Get, Post } from "@nestjs/common";
import { ApiAdminController } from "../auth/api-controller.decorators";
import { DeletionResponseDto } from "../common/dto/deletion-response.dto";
import { ApiEndpoint, ApiTag, UuidParam } from "../common/swagger";
import { AddProjectDefaultReviewersDto } from "./dto/add-project-default-reviewers.dto";
import { ProjectDefaultReviewerResponseDto } from "./dto/project-default-reviewer-response.dto";
import { ProjectDefaultReviewersService } from "./project-default-reviewers.service";

@ApiAdminController(
  ApiTag.ProjectDefaultReviewers,
  "v1/project-default-reviewers",
)
export class ProjectDefaultReviewersController {
  constructor(
    private readonly defaultReviewersService: ProjectDefaultReviewersService,
  ) {}

  @Get()
  @ApiEndpoint({
    summary: "List project default reviewers",
    response: "Project default reviewers returned",
    type: [ProjectDefaultReviewerResponseDto],
  })
  list(): Promise<ProjectDefaultReviewerResponseDto[]> {
    return this.defaultReviewersService.list();
  }

  @Get("projects")
  @ApiEndpoint({
    summary: "List the projects reviews were created for",
    description:
      "Suggestions for the project name. A default reviewer can be set for a project that has no review yet.",
    response: "Project names returned",
    type: [String],
  })
  knownProjects(): Promise<string[]> {
    return this.defaultReviewersService.knownProjects();
  }

  @Post()
  @ApiEndpoint({
    summary: "Add default reviewers to a project",
    description:
      "Every review created for the project from then on gets these users as reviewers. Users that already were default reviewers of the project are kept as they are.",
    response: "Project default reviewers added",
    type: [ProjectDefaultReviewerResponseDto],
    created: true,
    validation: true,
  })
  add(
    @Body() dto: AddProjectDefaultReviewersDto,
  ): Promise<ProjectDefaultReviewerResponseDto[]> {
    return this.defaultReviewersService.add(dto);
  }

  @Delete(":id")
  @ApiEndpoint({
    summary: "Remove a project default reviewer",
    description: "Reviews that already have this reviewer keep them.",
    response: "Project default reviewer removed",
    type: DeletionResponseDto,
    notFound: true,
  })
  delete(
    @UuidParam("id", "Project default reviewer identifier") id: string,
  ): Promise<DeletionResponseDto> {
    return this.defaultReviewersService.delete(id);
  }
}
