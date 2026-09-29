import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AppException } from "../common/app.exception";
import { DeletionResponseDto } from "../common/dto/deletion-response.dto";
import { ErrorCode } from "../common/error-code.enum";
import { PrismaService } from "../prisma/prisma.service";
import { normalizeProjectName } from "../project-default-reviewers/project-name";
import { toUserSummary, userSummarySelect } from "../users/users.service";
import { AddProjectOwnersDto } from "./dto/add-project-owners.dto";
import { ProjectOwnerResponseDto } from "./dto/project-owner-response.dto";

const projectOwnerInclude = {
  user: { select: userSummarySelect },
} satisfies Prisma.ProjectOwnerInclude;

type ProjectOwnerWithUser = Prisma.ProjectOwnerGetPayload<{
  include: typeof projectOwnerInclude;
}>;

/** The users owning the project a review was created for. */
export async function projectOwnerIdsFor(
  prisma: PrismaService,
  sourceProject: string | null,
): Promise<string[]> {
  const project = normalizeProjectName(sourceProject);
  if (!project) {
    return [];
  }

  const owners = await prisma.projectOwner.findMany({
    where: { project },
    select: { userId: true },
  });
  return owners.map((owner) => owner.userId);
}

/** The bare names of the projects `userId` owns. */
export async function projectsOwnedBy(
  prisma: PrismaService,
  userId: string,
): Promise<string[]> {
  const owners = await prisma.projectOwner.findMany({
    where: { userId },
    select: { project: true },
  });
  return owners.map((owner) => owner.project);
}

@Injectable()
export class ProjectOwnersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<ProjectOwnerResponseDto[]> {
    const owners = await this.prisma.projectOwner.findMany({
      include: projectOwnerInclude,
      orderBy: [{ project: "asc" }, { createdAt: "asc" }],
    });

    return owners.map((owner) => this.toResponse(owner));
  }

  async add(dto: AddProjectOwnersDto): Promise<ProjectOwnerResponseDto[]> {
    const project = normalizeProjectName(dto.project);
    if (!project) {
      throw new AppException(
        ErrorCode.UNKNOWN_ERROR,
        HttpStatus.BAD_REQUEST,
        "Project name is required",
      );
    }

    const userIds = [...new Set(dto.userIds)];
    const existingUsers = await this.prisma.user.count({
      where: { id: { in: userIds } },
    });
    if (existingUsers !== userIds.length) {
      throw new AppException(
        ErrorCode.USER_NOT_FOUND,
        HttpStatus.BAD_REQUEST,
        "One or more users were not found",
      );
    }

    await this.prisma.projectOwner.createMany({
      data: userIds.map((userId) => ({ project, userId })),
      skipDuplicates: true,
    });

    const owners = await this.prisma.projectOwner.findMany({
      where: { project, userId: { in: userIds } },
      include: projectOwnerInclude,
      orderBy: { createdAt: "asc" },
    });

    return owners.map((owner) => this.toResponse(owner));
  }

  async delete(id: string): Promise<DeletionResponseDto> {
    const owner = await this.prisma.projectOwner.findUnique({ where: { id } });
    if (!owner) {
      throw new AppException(
        ErrorCode.UNKNOWN_ERROR,
        HttpStatus.NOT_FOUND,
        "Project owner not found",
      );
    }

    await this.prisma.projectOwner.delete({ where: { id } });
    return { id, deleted: true };
  }

  private toResponse(owner: ProjectOwnerWithUser): ProjectOwnerResponseDto {
    return {
      ...owner,
      user: toUserSummary(owner.user),
    };
  }
}
