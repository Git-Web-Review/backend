import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AppException } from "../common/app.exception";
import { DeletionResponseDto } from "../common/dto/deletion-response.dto";
import { ErrorCode } from "../common/error-code.enum";
import { PrismaService } from "../prisma/prisma.service";
import { toUserSummary, userSummarySelect } from "../users/users.service";
import { AddProjectDefaultReviewersDto } from "./dto/add-project-default-reviewers.dto";
import { ProjectDefaultReviewerResponseDto } from "./dto/project-default-reviewer-response.dto";
import { normalizeProjectName } from "./project-name";

const defaultReviewerInclude = {
  user: { select: userSummarySelect },
} satisfies Prisma.ProjectDefaultReviewerInclude;

type DefaultReviewerWithUser = Prisma.ProjectDefaultReviewerGetPayload<{
  include: typeof defaultReviewerInclude;
}>;

@Injectable()
export class ProjectDefaultReviewersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<ProjectDefaultReviewerResponseDto[]> {
    const defaultReviewers = await this.prisma.projectDefaultReviewer.findMany({
      include: defaultReviewerInclude,
      orderBy: [{ project: "asc" }, { createdAt: "asc" }],
    });

    return defaultReviewers.map((defaultReviewer) =>
      this.toResponse(defaultReviewer),
    );
  }

  /** Projects already reviewed, suggested when typing a project name. */
  async knownProjects(): Promise<string[]> {
    const reviews = await this.prisma.review.findMany({
      where: { sourceProject: { not: null } },
      distinct: ["sourceProject"],
      select: { sourceProject: true },
    });

    return [
      ...new Set(
        reviews
          .map((review) => normalizeProjectName(review.sourceProject))
          .filter(Boolean),
      ),
    ].sort((left, right) => left.localeCompare(right));
  }

  async add(
    dto: AddProjectDefaultReviewersDto,
  ): Promise<ProjectDefaultReviewerResponseDto[]> {
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
        "One or more reviewers were not found",
      );
    }

    await this.prisma.projectDefaultReviewer.createMany({
      data: userIds.map((userId) => ({ project, userId })),
      skipDuplicates: true,
    });

    const defaultReviewers = await this.prisma.projectDefaultReviewer.findMany({
      where: { project, userId: { in: userIds } },
      include: defaultReviewerInclude,
      orderBy: { createdAt: "asc" },
    });

    return defaultReviewers.map((defaultReviewer) =>
      this.toResponse(defaultReviewer),
    );
  }

  async delete(id: string): Promise<DeletionResponseDto> {
    const defaultReviewer = await this.prisma.projectDefaultReviewer.findUnique(
      { where: { id } },
    );
    if (!defaultReviewer) {
      throw new AppException(
        ErrorCode.UNKNOWN_ERROR,
        HttpStatus.NOT_FOUND,
        "Project default reviewer not found",
      );
    }

    await this.prisma.projectDefaultReviewer.delete({ where: { id } });
    return { id, deleted: true };
  }

  /**
   * The users a new review of `project` gets as reviewers. The owner is left
   * out: nobody reviews their own review.
   */
  async userIdsFor(project: string | null, ownerId: string): Promise<string[]> {
    const name = normalizeProjectName(project);
    if (!name) {
      return [];
    }

    const defaultReviewers = await this.prisma.projectDefaultReviewer.findMany({
      where: { project: name, userId: { not: ownerId } },
      select: { userId: true },
      orderBy: { createdAt: "asc" },
    });

    return defaultReviewers.map((defaultReviewer) => defaultReviewer.userId);
  }

  private toResponse(
    defaultReviewer: DefaultReviewerWithUser,
  ): ProjectDefaultReviewerResponseDto {
    return {
      ...defaultReviewer,
      user: toUserSummary(defaultReviewer.user),
    };
  }
}
