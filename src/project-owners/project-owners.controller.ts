import { Body, Delete, Get, Post } from "@nestjs/common";
import { ApiAdminController } from "../auth/api-controller.decorators";
import { DeletionResponseDto } from "../common/dto/deletion-response.dto";
import { ApiEndpoint, ApiTag, UuidParam } from "../common/swagger";
import { AddProjectOwnersDto } from "./dto/add-project-owners.dto";
import { ProjectOwnerResponseDto } from "./dto/project-owner-response.dto";
import { ProjectOwnersService } from "./project-owners.service";

@ApiAdminController(ApiTag.ProjectOwners, "v1/project-owners")
export class ProjectOwnersController {
  constructor(private readonly projectOwnersService: ProjectOwnersService) {}

  @Get()
  @ApiEndpoint({
    summary: "List project owners",
    response: "Project owners returned",
    type: [ProjectOwnerResponseDto],
  })
  list(): Promise<ProjectOwnerResponseDto[]> {
    return this.projectOwnersService.list();
  }

  @Post()
  @ApiEndpoint({
    summary: "Add owners to a project",
    description:
      "Project owners see every review of the project and manage them as the review owner would. Users that already owned the project are kept as they are.",
    response: "Project owners added",
    type: [ProjectOwnerResponseDto],
    created: true,
    validation: true,
  })
  add(@Body() dto: AddProjectOwnersDto): Promise<ProjectOwnerResponseDto[]> {
    return this.projectOwnersService.add(dto);
  }

  @Delete(":id")
  @ApiEndpoint({
    summary: "Remove a project owner",
    response: "Project owner removed",
    type: DeletionResponseDto,
    notFound: true,
  })
  delete(
    @UuidParam("id", "Project owner identifier") id: string,
  ): Promise<DeletionResponseDto> {
    return this.projectOwnersService.delete(id);
  }
}
