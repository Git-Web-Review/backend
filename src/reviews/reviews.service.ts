import { Injectable } from "@nestjs/common";
import { Prisma, ReviewStatus, type User } from "@prisma/client";
import { DeletionResponseDto } from "../common/dto/deletion-response.dto";
import { GitwebUrlRulesService } from "../gitweb-url-rules/gitweb-url-rules.service";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectDefaultReviewersService } from "../project-default-reviewers/project-default-reviewers.service";
import { AddReviewReviewersDto } from "./dto/add-review-reviewers.dto";
import { CreateReviewDto } from "./dto/create-review.dto";
import { PreviewReviewDto } from "./dto/preview-review.dto";
import { ReviewDashboardQueryDto } from "./dto/review-dashboard-query.dto";
import { ReviewDashboardResponseDto } from "./dto/review-dashboard-response.dto";
import { ReviewPreviewResponseDto } from "./dto/review-preview-response.dto";
import { ReviewResponseDto } from "./dto/review-response.dto";
import { UpdateReviewDto } from "./dto/update-review.dto";
import type { GitwebMetadata } from "./gitweb/gitweb-metadata";
import { GitwebMetadataService } from "./gitweb/gitweb-metadata.service";
import {
  assertCanRead,
  assertIsOwner,
  assertIsOwnerOrReviewer,
} from "./review-access";
import { ReviewFieldValuesService } from "./review-field-values.service";
import { ReviewNotificationsService } from "./review-notifications.service";
import {
  findReviewOrThrow,
  reviewInclude,
  toUserSummary,
  userSummarySelect,
} from "./review-queries";
import { ReviewResponsesService } from "./review-responses.service";
import { ReviewReviewersService } from "./review-reviewers.service";
import { nullIfBlank, reviewTitleFromCommits, truncate } from "./review-text";

/** Reviews themselves: dashboard, creation, details and deletion. */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gitwebUrlRules: GitwebUrlRulesService,
    private readonly projectDefaultReviewers: ProjectDefaultReviewersService,
    private readonly gitwebMetadata: GitwebMetadataService,
    private readonly responses: ReviewResponsesService,
    private readonly reviewers: ReviewReviewersService,
    private readonly fieldValues: ReviewFieldValuesService,
    private readonly reviewNotifications: ReviewNotificationsService,
  ) {}

  async dashboard(
    user: User,
    query: ReviewDashboardQueryDto,
  ): Promise<ReviewDashboardResponseDto> {
    const ownedWhere = {
      ownerId: user.id,
      status: { not: ReviewStatus.CLOSED },
    } satisfies Prisma.ReviewWhereInput;
    const assignedWhere = {
      status: { not: ReviewStatus.CLOSED },
      reviewers: { some: { userId: user.id } },
    } satisfies Prisma.ReviewWhereInput;
    const doneWhere = {
      status: ReviewStatus.CLOSED,
      OR: [{ ownerId: user.id }, { reviewers: { some: { userId: user.id } } }],
    } satisfies Prisma.ReviewWhereInput;

    const [owned, assigned, done] = await Promise.all([
      this.dashboardPage(ownedWhere, query.ownedPage, query.limit),
      this.dashboardPage(assignedWhere, query.assignedPage, query.limit),
      this.dashboardPage(doneWhere, query.donePage, query.limit),
    ]);

    return {
      owned,
      assigned,
      done,
    };
  }

  private async dashboardPage(
    where: Prisma.ReviewWhereInput,
    page: number,
    limit: number,
  ) {
    const [items, total, gitwebUrlRules] = await Promise.all([
      this.prisma.review.findMany({
        where,
        include: reviewInclude,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.review.count({ where }),
      this.gitwebUrlRules.list(false),
    ]);

    return {
      items: await Promise.all(
        items.map((review) =>
          this.responses.toResponse(review, gitwebUrlRules),
        ),
      ),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async preview(
    user: User,
    dto: PreviewReviewDto,
  ): Promise<ReviewPreviewResponseDto> {
    const gitwebMetadata = await this.gitwebMetadata.fetchGitwebMetadata(
      dto.gitwebUrl,
    );
    const reviewerUsers = await this.reviewers.ensureReviewerUsersByEmails(
      gitwebMetadata.reviewerEmails,
      user.id,
    );
    const defaultReviewerUserIds = await this.projectDefaultReviewers.userIdsFor(
      gitwebMetadata.sourceProject,
      user.id,
    );
    const defaultReviewerUsers = await this.prisma.user.findMany({
      where: { id: { in: defaultReviewerUserIds } },
      select: userSummarySelect,
      orderBy: { email: "asc" },
    });

    return {
      gitwebUrl: dto.gitwebUrl,
      linkKind: gitwebMetadata.linkKind,
      commitOptions: gitwebMetadata.commitOptions,
      title: gitwebMetadata.title,
      description: truncate(
        gitwebMetadata.description ?? gitwebMetadata.log,
        4000,
      ),
      sourceProject: gitwebMetadata.sourceProject,
      sourceBranch: gitwebMetadata.sourceBranch,
      sourceCommit: gitwebMetadata.sourceCommit,
      gitwebLog: gitwebMetadata.log,
      gitwebFetchedAt: gitwebMetadata.fetchedAt,
      gitwebFetchError: gitwebMetadata.fetchError,
      reviewerEmails: gitwebMetadata.reviewerEmails,
      reviewerUsers: reviewerUsers.map(toUserSummary),
      defaultReviewerUsers: defaultReviewerUsers.map(toUserSummary),
      gitDiff: gitwebMetadata.gitDiff,
    };
  }

  async create(
    ownerId: string,
    dto: CreateReviewDto,
  ): Promise<ReviewResponseDto> {
    const requestedReviewerUserIds = await this.reviewers.validReviewerUserIds(
      dto.reviewerUserIds ?? [],
      ownerId,
    );
    const fieldValueCreates = await this.fieldValues.validatedFieldValueCreates(
      dto.fieldValues,
    );
    const gitwebMetadata = await this.gitwebMetadata.fetchGitwebMetadata(
      dto.gitwebUrl,
    );
    // The project's default reviewers join whatever the caller asked for.
    const reviewerUserIds = [
      ...new Set([
        ...requestedReviewerUserIds,
        ...(await this.projectDefaultReviewers.userIdsFor(
          gitwebMetadata.sourceProject,
          ownerId,
        )),
      ]),
    ];
    const commitCreates = await this.gitwebMetadata.commitCreatesFromMetadata(
      gitwebMetadata,
      dto.commitHashes,
    );

    const createdReview = await this.prisma.review.create({
      data: {
        gitwebUrl: dto.gitwebUrl,
        ...newReviewText(gitwebMetadata, commitCreates, dto.title),
        sourceProject: gitwebMetadata.sourceProject,
        sourceBranch: gitwebMetadata.sourceBranch,
        gitwebTitle: gitwebMetadata.title,
        gitwebLog: gitwebMetadata.log,
        gitwebRawHtml: gitwebMetadata.rawHtml,
        gitwebSnapshot: gitwebMetadata.snapshot ?? Prisma.JsonNull,
        gitwebFetchedAt: gitwebMetadata.fetchedAt,
        gitwebFetchError: gitwebMetadata.fetchError,
        ownerId,
        ...(commitCreates.length
          ? {
              commits: {
                create: commitCreates,
              },
            }
          : {}),
        reviewers: {
          createMany: {
            data: reviewerUserIds.map((userId) => ({ userId })),
          },
        },
        ...(fieldValueCreates.length
          ? {
              fieldValues: {
                createMany: { data: fieldValueCreates },
              },
            }
          : {}),
      },
    });
    const review = await findReviewOrThrow(this.prisma, createdReview.id);

    await this.reviewNotifications.notifyReviewers(review, reviewerUserIds);
    return this.responses.toResponse(review);
  }

  async getOne(user: User, reviewId: string): Promise<ReviewResponseDto> {
    const review = await findReviewOrThrow(this.prisma, reviewId);
    assertCanRead(user, review);
    return this.responses.toResponse(review);
  }

  async update(
    user: User,
    reviewId: string,
    dto: UpdateReviewDto,
  ): Promise<ReviewResponseDto> {
    const existingReview = await findReviewOrThrow(this.prisma, reviewId);
    if (hasOwnerOnlyUpdate(dto)) {
      assertIsOwner(user, existingReview);
    }

    const reviewerUserIds = dto.reviewerUserIds
      ? await this.reviewers.validReviewerUserIds(dto.reviewerUserIds, user.id)
      : null;
    const existingReviewerIds = new Set(
      existingReview.reviewers.map((reviewer) => reviewer.userId),
    );
    const nextReviewerIds = new Set(reviewerUserIds ?? existingReviewerIds);
    const addedReviewerIds = [...nextReviewerIds].filter(
      (userId) => !existingReviewerIds.has(userId),
    );

    const review = await this.prisma.$transaction(async (tx) => {
      if (reviewerUserIds) {
        await tx.reviewReviewer.deleteMany({
          where: { reviewId, userId: { notIn: reviewerUserIds } },
        });
        await tx.reviewReviewer.createMany({
          data: addedReviewerIds.map((userId) => ({ reviewId, userId })),
          skipDuplicates: true,
        });
      }

      return tx.review.update({
        where: { id: reviewId },
        data: {
          ...(dto.title !== undefined
            ? { title: nullIfBlank(dto.title) ?? existingReview.title }
            : {}),
          ...(dto.description !== undefined
            ? { description: truncate(nullIfBlank(dto.description), 4000) }
            : {}),
        },
        include: reviewInclude,
      });
    });

    await this.reviewNotifications.notifyReviewers(review, addedReviewerIds);
    return this.responses.toResponse(review);
  }

  /**
   * Adds reviewers without touching the ones already there, so a reviewer can
   * bring someone in but never take anyone out.
   */
  async addReviewers(
    user: User,
    reviewId: string,
    dto: AddReviewReviewersDto,
  ): Promise<ReviewResponseDto> {
    const existingReview = await findReviewOrThrow(this.prisma, reviewId);
    assertIsOwnerOrReviewer(
      user,
      existingReview,
      "Only the review owner or reviewers can add reviewers",
    );

    const existingReviewerIds = new Set(
      existingReview.reviewers.map((reviewer) => reviewer.userId),
    );
    const addedReviewerIds = (
      await this.reviewers.validReviewerUserIds(
        dto.userIds,
        existingReview.ownerId,
      )
    ).filter((userId) => !existingReviewerIds.has(userId));

    if (addedReviewerIds.length === 0) {
      return this.responses.toResponse(existingReview);
    }

    await this.prisma.reviewReviewer.createMany({
      data: addedReviewerIds.map((userId) => ({ reviewId, userId })),
      skipDuplicates: true,
    });
    const review = await findReviewOrThrow(this.prisma, reviewId);

    await this.reviewNotifications.notifyReviewers(review, addedReviewerIds);
    return this.responses.toResponse(review);
  }

  async delete(user: User, reviewId: string): Promise<DeletionResponseDto> {
    const existingReview = await findReviewOrThrow(this.prisma, reviewId);
    assertIsOwner(user, existingReview);

    await this.prisma.review.delete({ where: { id: reviewId } });

    return { id: reviewId, deleted: true };
  }
}

function hasOwnerOnlyUpdate(dto: UpdateReviewDto): boolean {
  return (
    dto.reviewerUserIds !== undefined ||
    dto.title !== undefined ||
    dto.description !== undefined
  );
}

/**
 * Title, description and source commit of a new review. A branch link names
 * the review after its series and lists the commits when there are several.
 */
function newReviewText(
  metadata: GitwebMetadata,
  commitCreates: Prisma.ReviewCommitCreateWithoutReviewInput[],
  requestedTitle: string | undefined,
) {
  const isBranchLink = metadata.linkKind === "SUMMARY";
  const commitCount = commitCreates.length;
  const title =
    nullIfBlank(requestedTitle) ??
    (isBranchLink && commitCount > 0
      ? reviewTitleFromCommits(
          metadata.sourceBranch,
          [...commitCreates].reverse().map((commit) => commit.title),
        )
      : metadata.title);
  const description =
    isBranchLink && commitCount > 1
      ? commitCreates.map((commit) => `- ${commit.title}`).join("\n")
      : (metadata.description ?? metadata.log);
  const sourceCommit = isBranchLink
    ? (commitCreates.at(-1)?.hash ?? metadata.sourceCommit)
    : metadata.sourceCommit;

  return { title, description: truncate(description, 4000), sourceCommit };
}
