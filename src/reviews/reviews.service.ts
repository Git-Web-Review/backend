import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { HttpStatus, Injectable } from "@nestjs/common";
import {
  NotificationType,
  Prisma,
  ReviewCommentSide,
  ReviewCommitStatus,
  ReviewFieldType,
  ReviewStatus,
  UserRole,
  type User,
} from "@prisma/client";
import { AppException } from "../common/app.exception";
import { ErrorCode } from "../common/error-code.enum";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateReviewCommentDto } from "./dto/create-review-comment.dto";
import { CreateReviewCommentMessageDto } from "./dto/create-review-comment-message.dto";
import { CreateReviewDto } from "./dto/create-review.dto";
import { PreviewReviewDto } from "./dto/preview-review.dto";
import { ReviewCommentResponseDto } from "./dto/review-comment-response.dto";
import { ReviewDashboardQueryDto } from "./dto/review-dashboard-query.dto";
import { ReviewDashboardResponseDto } from "./dto/review-dashboard-response.dto";
import { ReviewDeletionResponseDto } from "./dto/review-deletion-response.dto";
import { ReviewDiffResponseDto } from "./dto/review-diff-file-response.dto";
import { ReviewPreviewResponseDto } from "./dto/review-preview-response.dto";
import { ReviewResponseDto } from "./dto/review-response.dto";
import { SetReviewFieldValueDto } from "./dto/set-review-field-value.dto";
import { UpdateReviewCommentMessageDto } from "./dto/update-review-comment-message.dto";
import { UpdateReviewCommentDto } from "./dto/update-review-comment.dto";
import { UpdateReviewDto } from "./dto/update-review.dto";

type GitwebLinkKind = "COMMIT" | "SUMMARY";

type GitCommitOption = {
  hash: string;
  title: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string | null;
};

type GitwebMetadata = {
  linkKind: GitwebLinkKind;
  title: string | null;
  description: string | null;
  log: string | null;
  rawHtml: string | null;
  remoteUrl: string | null;
  sourceProject: string | null;
  sourceBranch: string | null;
  sourceCommit: string | null;
  reviewerEmails: string[];
  commitOptions: GitCommitOption[];
  gitDiff: ReviewDiffResponseDto;
  snapshot: Prisma.InputJsonObject | null;
  fetchedAt: Date | null;
  fetchError: string | null;
};

type GitCommitMetadata = {
  hash: string;
  title: string;
  body: string;
  message: string;
  authorName: string;
  authorEmail: string;
  gitDiff: ReviewDiffResponseDto;
};

const userSummarySelect = {
  id: true,
  email: true,
  hostname: true,
  settings: {
    select: {
      nickname: true,
      mailNotificationsEnabled: true,
      ircNotificationsEnabled: true,
    },
  },
  profileImage: { select: { userId: true } },
} satisfies Prisma.UserSelect;

const reviewInclude = {
  owner: { select: userSummarySelect },
  reviewers: {
    orderBy: { requestedAt: "asc" },
    include: { user: { select: userSummarySelect } },
  },
  commits: {
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: {
      acks: {
        orderBy: { acknowledgedAt: "asc" },
        include: { user: { select: userSummarySelect } },
      },
    },
  },
  fieldValues: {
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.ReviewInclude;

const reviewCommentInclude = {
  doneBy: { select: userSummarySelect },
  messages: {
    orderBy: { createdAt: "asc" },
    include: { from: { select: userSummarySelect } },
  },
} satisfies Prisma.ReviewCommentInclude;

type UserSummary = Prisma.UserGetPayload<{ select: typeof userSummarySelect }>;

type ReviewWithRelations = Prisma.ReviewGetPayload<{
  include: typeof reviewInclude;
}>;

type ReviewCommentWithMessages = Prisma.ReviewCommentGetPayload<{
  include: typeof reviewCommentInclude;
}>;

const execFileAsync = promisify(execFile);
const gitCacheDirectory =
  process.env.GIT_WEB_REVIEW_GIT_CACHE_DIR ?? "/tmp/git-web-review/repos";
const placeholderFirebaseUidPrefix = "placeholder:";

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
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
    const [items, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        include: reviewInclude,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.review.count({ where }),
    ]);

    return {
      items: items.map((review) => this.toResponse(review)),
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
    const gitwebMetadata = await this.fetchGitwebMetadata(dto.gitwebUrl);
    const reviewerUsers = await this.ensureReviewerUsersByEmails(
      gitwebMetadata.reviewerEmails,
      user.id,
    );

    return {
      gitwebUrl: dto.gitwebUrl,
      linkKind: gitwebMetadata.linkKind,
      commitOptions: gitwebMetadata.commitOptions,
      title: gitwebMetadata.title,
      description: this.truncate(
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
      reviewerUsers: reviewerUsers.map((reviewer) =>
        this.toUserSummary(reviewer),
      ),
      gitDiff: gitwebMetadata.gitDiff,
    };
  }

  async create(
    ownerId: string,
    dto: CreateReviewDto,
  ): Promise<ReviewResponseDto> {
    const reviewerUserIds = await this.validReviewerUserIds(
      dto.reviewerUserIds ?? [],
      ownerId,
    );
    const fieldValueCreates = await this.validatedFieldValueCreates(
      dto.fieldValues,
    );
    const gitwebMetadata = await this.fetchGitwebMetadata(dto.gitwebUrl);
    const commitCreates = await this.commitCreatesFromMetadata(
      gitwebMetadata,
      dto.commitHashes,
    );
    const commitCount = commitCreates.length;
    const title =
      gitwebMetadata.linkKind === "SUMMARY" && commitCount > 0
        ? commitCount === 1
          ? commitCreates[0].title
          : `${gitwebMetadata.sourceBranch ?? "series"} (${commitCount} commits)`
        : gitwebMetadata.title;
    const description =
      gitwebMetadata.linkKind === "SUMMARY" && commitCount > 1
        ? commitCreates.map((commit) => `- ${commit.title}`).join("\n")
        : (gitwebMetadata.description ?? gitwebMetadata.log);
    const sourceCommit =
      gitwebMetadata.linkKind === "SUMMARY"
        ? (commitCreates.at(-1)?.hash ?? gitwebMetadata.sourceCommit)
        : gitwebMetadata.sourceCommit;

    const createdReview = await this.prisma.review.create({
      data: {
        gitwebUrl: dto.gitwebUrl,
        title,
        description: this.truncate(description, 4000),
        sourceProject: gitwebMetadata.sourceProject,
        sourceBranch: gitwebMetadata.sourceBranch,
        sourceCommit,
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
    const review = await this.findReviewOrThrow(createdReview.id);

    await this.notifyReviewers(review, reviewerUserIds);
    return this.toResponse(review);
  }

  async getOne(user: User, reviewId: string): Promise<ReviewResponseDto> {
    const review = await this.findReviewOrThrow(reviewId);
    this.assertCanRead(user, review);
    return this.toResponse(review);
  }

  async setFieldValue(
    user: User,
    reviewId: string,
    fieldId: string,
    dto: SetReviewFieldValueDto,
  ): Promise<ReviewResponseDto> {
    const review = await this.findReviewOrThrow(reviewId);
    this.assertIsOwner(user, review);

    const field = await this.prisma.reviewFieldDefinition.findUnique({
      where: { id: fieldId },
    });
    if (!field) {
      throw new AppException(
        ErrorCode.UNKNOWN_ERROR,
        HttpStatus.NOT_FOUND,
        "Review field not found",
      );
    }

    const value = dto.value?.trim() ?? "";
    if (!value) {
      await this.prisma.reviewFieldValue.deleteMany({
        where: { reviewId, fieldId },
      });
    } else {
      this.assertValidFieldValue(field.type, value);
      await this.prisma.reviewFieldValue.upsert({
        where: { reviewId_fieldId: { reviewId, fieldId } },
        create: { reviewId, fieldId, value },
        update: { value },
      });
    }

    return this.toResponse(await this.findReviewOrThrow(reviewId));
  }

  private async validatedFieldValueCreates(
    fieldValues: CreateReviewDto["fieldValues"],
  ): Promise<{ fieldId: string; value: string }[]> {
    const creates = (fieldValues ?? [])
      .map((fieldValue) => ({
        fieldId: fieldValue.fieldId,
        value: fieldValue.value.trim(),
      }))
      .filter((fieldValue) => fieldValue.value);
    if (!creates.length) {
      return [];
    }

    const fields = await this.prisma.reviewFieldDefinition.findMany({
      where: { id: { in: creates.map((fieldValue) => fieldValue.fieldId) } },
    });
    for (const create of creates) {
      const field = fields.find(
        (currentField) => currentField.id === create.fieldId,
      );
      if (!field) {
        throw new AppException(
          ErrorCode.UNKNOWN_ERROR,
          HttpStatus.NOT_FOUND,
          "Review field not found",
        );
      }
      this.assertValidFieldValue(field.type, create.value);
    }

    return creates;
  }

  private assertValidFieldValue(type: ReviewFieldType, value: string): void {
    if (type === ReviewFieldType.NUMBER) {
      if (!/^-?\d+(?:[.,]\d+)?$/.test(value)) {
        throw new AppException(
          ErrorCode.UNKNOWN_ERROR,
          HttpStatus.BAD_REQUEST,
          "Field value must be a number",
        );
      }
      return;
    }

    if (type === ReviewFieldType.LINK || type === ReviewFieldType.IMAGE) {
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        throw new AppException(
          ErrorCode.UNKNOWN_ERROR,
          HttpStatus.BAD_REQUEST,
          "Field value must be a valid URL",
        );
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new AppException(
          ErrorCode.UNKNOWN_ERROR,
          HttpStatus.BAD_REQUEST,
          "Field value must be an http(s) URL",
        );
      }
    }
  }

  async listComments(
    user: User,
    reviewId: string,
  ): Promise<ReviewCommentResponseDto[]> {
    const review = await this.findReviewOrThrow(reviewId);
    this.assertCanRead(user, review);

    const comments = await this.prisma.reviewComment.findMany({
      where: { reviewId },
      orderBy: { createdAt: "asc" },
      include: reviewCommentInclude,
    });

    return comments.flatMap((comment) => this.toCommentResponses(comment));
  }

  async addComment(
    user: User,
    reviewId: string,
    dto: CreateReviewCommentDto,
  ): Promise<ReviewCommentResponseDto> {
    const review = await this.findReviewOrThrow(reviewId);
    this.assertCanRead(user, review);

    const message = dto.message.trim();
    if (!message) {
      throw new AppException(
        ErrorCode.UNKNOWN_ERROR,
        HttpStatus.BAD_REQUEST,
        "Comment message cannot be empty",
      );
    }

    const comment = await this.prisma.reviewComment.create({
      data: {
        reviewId,
        commitHash: this.nullIfBlank(dto.commitHash),
        filePath: this.nullIfBlank(dto.filePath),
        lineNumber: dto.lineNumber ?? null,
        side: dto.side ?? ReviewCommentSide.AFTER,
        messages: {
          create: {
            fromId: user.id,
            message,
          },
        },
      },
      include: reviewCommentInclude,
    });

    await this.updateReviewStatusAfterComment(user, review);
    await this.notifyCommentReceived(review, comment, message, user.id);

    return this.toCommentResponses(comment)[0];
  }

  async addCommentMessage(
    user: User,
    reviewId: string,
    commentId: string,
    dto: CreateReviewCommentMessageDto,
  ): Promise<ReviewCommentResponseDto[]> {
    const review = await this.findReviewOrThrow(reviewId);
    this.assertCanRead(user, review);

    const message = dto.message.trim();
    if (!message) {
      throw new AppException(
        ErrorCode.UNKNOWN_ERROR,
        HttpStatus.BAD_REQUEST,
        "Comment message cannot be empty",
      );
    }

    const comment = await this.prisma.reviewComment.findFirst({
      where: { id: commentId, reviewId },
      select: { id: true },
    });
    if (!comment) {
      throw new AppException(
        ErrorCode.COMMENT_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        "Comment not found",
      );
    }

    const updatedComment = await this.prisma.reviewComment.update({
      where: { id: commentId },
      data: {
        done: false,
        doneById: null,
        doneAt: null,
        messages: {
          create: {
            fromId: user.id,
            message,
          },
        },
      },
      include: reviewCommentInclude,
    });

    await this.updateReviewStatusAfterComment(user, review);
    await this.notifyCommentReceived(review, updatedComment, message, user.id);

    return this.toCommentResponses(updatedComment);
  }

  async updateComment(
    user: User,
    reviewId: string,
    commentId: string,
    dto: UpdateReviewCommentDto,
  ): Promise<ReviewCommentResponseDto[]> {
    const review = await this.findReviewOrThrow(reviewId);
    this.assertCanResolveComment(user, review);

    const comment = await this.prisma.reviewComment.findFirst({
      where: { id: commentId, reviewId },
      select: { id: true },
    });
    if (!comment) {
      throw new AppException(
        ErrorCode.COMMENT_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        "Comment not found",
      );
    }

    const updatedComment = await this.prisma.reviewComment.update({
      where: { id: commentId },
      data: dto.done
        ? { done: true, doneById: user.id, doneAt: new Date() }
        : { done: false, doneById: null, doneAt: null },
      include: reviewCommentInclude,
    });

    await this.refreshReviewStatusFromComments(reviewId, user.id);

    return this.toCommentResponses(updatedComment);
  }

  async deleteComment(
    user: User,
    reviewId: string,
    commentId: string,
  ): Promise<ReviewDeletionResponseDto> {
    const review = await this.findReviewOrThrow(reviewId);
    this.assertCanRead(user, review);

    const comment = await this.prisma.reviewComment.findFirst({
      where: { id: commentId, reviewId },
      select: { id: true, messages: { select: { fromId: true } } },
    });
    if (!comment) {
      throw new AppException(
        ErrorCode.COMMENT_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        "Comment not found",
      );
    }

    if (
      comment.messages.length === 0 ||
      comment.messages.some((message) => message.fromId !== user.id)
    ) {
      throw new AppException(
        ErrorCode.ROLE_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        "Only the comment owner can delete this comment",
      );
    }

    await this.prisma.reviewComment.delete({ where: { id: commentId } });

    await this.refreshReviewStatusFromComments(reviewId, user.id);

    return { id: commentId, deleted: true };
  }

  async deleteCommentMessage(
    user: User,
    reviewId: string,
    commentId: string,
    messageId: string,
  ): Promise<ReviewDeletionResponseDto> {
    const review = await this.findReviewOrThrow(reviewId);
    this.assertCanRead(user, review);

    const comment = await this.prisma.reviewComment.findFirst({
      where: { id: commentId, reviewId },
      select: {
        id: true,
        messages: { select: { id: true, fromId: true } },
      },
    });
    if (!comment) {
      throw new AppException(
        ErrorCode.COMMENT_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        "Comment not found",
      );
    }

    const message = comment.messages.find((item) => item.id === messageId);
    if (!message) {
      throw new AppException(
        ErrorCode.COMMENT_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        "Comment message not found",
      );
    }

    if (message.fromId !== user.id) {
      throw new AppException(
        ErrorCode.ROLE_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        "Only the comment owner can delete this comment",
      );
    }

    await this.prisma.reviewCommentMessage.delete({ where: { id: messageId } });

    if (comment.messages.length === 1) {
      await this.prisma.reviewComment.delete({ where: { id: commentId } });
    }

    await this.refreshReviewStatusFromComments(reviewId, user.id);

    return { id: messageId, deleted: true };
  }

  async updateCommentMessage(
    user: User,
    reviewId: string,
    commentId: string,
    messageId: string,
    dto: UpdateReviewCommentMessageDto,
  ): Promise<ReviewCommentResponseDto[]> {
    const review = await this.findReviewOrThrow(reviewId);
    this.assertCanRead(user, review);

    const nextMessage = dto.message.trim();
    if (!nextMessage) {
      throw new AppException(
        ErrorCode.UNKNOWN_ERROR,
        HttpStatus.BAD_REQUEST,
        "Comment message cannot be empty",
      );
    }

    const comment = await this.prisma.reviewComment.findFirst({
      where: { id: commentId, reviewId },
      select: {
        id: true,
        messages: { select: { id: true, fromId: true } },
      },
    });
    if (!comment) {
      throw new AppException(
        ErrorCode.COMMENT_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        "Comment not found",
      );
    }

    const message = comment.messages.find((item) => item.id === messageId);
    if (!message) {
      throw new AppException(
        ErrorCode.COMMENT_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        "Comment message not found",
      );
    }

    if (message.fromId !== user.id) {
      throw new AppException(
        ErrorCode.ROLE_FORBIDDEN,
        HttpStatus.FORBIDDEN,
        "Only the comment owner can edit this comment",
      );
    }

    await this.prisma.reviewCommentMessage.update({
      where: { id: messageId },
      data: { message: nextMessage },
    });

    const updatedComment = await this.prisma.reviewComment.findUniqueOrThrow({
      where: { id: commentId },
      include: reviewCommentInclude,
    });

    return this.toCommentResponses(updatedComment);
  }

  async acknowledgeCommit(
    user: User,
    reviewId: string,
    commitId: string,
  ): Promise<ReviewResponseDto> {
    const review = await this.findReviewOrThrow(reviewId);
    this.assertIsReviewer(user, review);

    if (review.status === ReviewStatus.CLOSED) {
      throw new AppException(
        ErrorCode.UNKNOWN_ERROR,
        HttpStatus.BAD_REQUEST,
        "Review is closed",
      );
    }

    const commit = review.commits.find((item) => item.id === commitId);
    if (!commit) {
      throw new AppException(
        ErrorCode.REVIEW_COMMIT_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        "Review commit not found",
      );
    }

    await this.prisma.reviewCommitAck.upsert({
      where: {
        reviewCommitId_userId: { reviewCommitId: commit.id, userId: user.id },
      },
      update: { acknowledgedAt: new Date() },
      create: { reviewCommitId: commit.id, userId: user.id },
    });

    const updatedReview = await this.refreshReviewStatusFromComments(
      reviewId,
      user.id,
    );

    return this.toResponse(updatedReview);
  }

  async acknowledge(user: User, reviewId: string): Promise<ReviewResponseDto> {
    const review = await this.findReviewOrThrow(reviewId);
    this.assertIsReviewer(user, review);

    if (review.status === ReviewStatus.CLOSED) {
      throw new AppException(
        ErrorCode.UNKNOWN_ERROR,
        HttpStatus.BAD_REQUEST,
        "Review is closed",
      );
    }

    await this.prisma.$transaction([
      ...review.commits.map((commit) =>
        this.prisma.reviewCommitAck.upsert({
          where: {
            reviewCommitId_userId: {
              reviewCommitId: commit.id,
              userId: user.id,
            },
          },
          update: { acknowledgedAt: new Date() },
          create: { reviewCommitId: commit.id, userId: user.id },
        }),
      ),
      this.prisma.reviewReviewer.update({
        where: { reviewId_userId: { reviewId, userId: user.id } },
        data: { acknowledgedAt: new Date() },
      }),
    ]);

    const updatedReview = await this.refreshReviewStatusFromComments(
      reviewId,
      user.id,
    );

    return this.toResponse(updatedReview);
  }

  async markCommitReviewed(
    user: User,
    reviewId: string,
    commitId: string,
  ): Promise<ReviewResponseDto> {
    const review = await this.findReviewOrThrow(reviewId);
    this.assertIsReviewer(user, review);

    if (review.status === ReviewStatus.CLOSED) {
      throw new AppException(
        ErrorCode.UNKNOWN_ERROR,
        HttpStatus.BAD_REQUEST,
        "Review is closed",
      );
    }

    const commit = review.commits.find((item) => item.id === commitId);
    if (!commit) {
      throw new AppException(
        ErrorCode.REVIEW_COMMIT_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        "Review commit not found",
      );
    }

    if (commit.status !== ReviewCommitStatus.ACKED) {
      await this.prisma.reviewCommit.update({
        where: { id: commit.id },
        data: { status: ReviewCommitStatus.REVIEWED },
      });
      await this.notifyCommitsReviewed(review, [commit.title], user.id);
    }

    const updatedReview = await this.refreshReviewStatusFromComments(
      reviewId,
      user.id,
    );

    return this.toResponse(updatedReview);
  }

  async markReviewed(user: User, reviewId: string): Promise<ReviewResponseDto> {
    const review = await this.findReviewOrThrow(reviewId);
    this.assertIsReviewer(user, review);

    if (review.status === ReviewStatus.CLOSED) {
      throw new AppException(
        ErrorCode.UNKNOWN_ERROR,
        HttpStatus.BAD_REQUEST,
        "Review is closed",
      );
    }

    const pendingCommits = review.commits.filter(
      (commit) =>
        commit.status !== ReviewCommitStatus.ACKED &&
        commit.status !== ReviewCommitStatus.REVIEWED,
    );
    if (pendingCommits.length > 0) {
      await this.prisma.reviewCommit.updateMany({
        where: { id: { in: pendingCommits.map((commit) => commit.id) } },
        data: { status: ReviewCommitStatus.REVIEWED },
      });
      await this.notifyCommitsReviewed(
        review,
        pendingCommits.map((commit) => commit.title),
        user.id,
      );
    }

    const updatedReview = await this.refreshReviewStatusFromComments(
      reviewId,
      user.id,
    );

    return this.toResponse(updatedReview);
  }

  async close(user: User, reviewId: string): Promise<ReviewResponseDto> {
    const review = await this.findReviewOrThrow(reviewId);
    this.assertIsOwner(user, review);

    if (review.status === ReviewStatus.CLOSED) {
      return this.toResponse(review);
    }

    if (review.status !== ReviewStatus.ACKED) {
      throw new AppException(
        ErrorCode.UNKNOWN_ERROR,
        HttpStatus.BAD_REQUEST,
        "Review must be acked before it can be closed",
      );
    }

    const closedReview = await this.prisma.review.update({
      where: { id: reviewId },
      data: { status: ReviewStatus.CLOSED },
      include: reviewInclude,
    });

    await this.notifyReviewStatusChanged(
      closedReview,
      review.status,
      closedReview.status,
      user.id,
    );

    return this.toResponse(closedReview);
  }

  async closeAckedReviewsMergedOnMaster(): Promise<number> {
    const ackedReviews = await this.prisma.review.findMany({
      where: { status: ReviewStatus.ACKED },
      include: reviewInclude,
    });

    let closedCount = 0;
    for (const review of ackedReviews) {
      try {
        if (!(await this.reviewMergedOnMaster(review))) {
          continue;
        }
      } catch {
        continue;
      }

      const closedReview = await this.prisma.review.update({
        where: { id: review.id },
        data: { status: ReviewStatus.CLOSED },
        include: reviewInclude,
      });
      await this.notifyReviewStatusChanged(
        closedReview,
        ReviewStatus.ACKED,
        ReviewStatus.CLOSED,
        "",
      );
      closedCount += 1;
    }

    return closedCount;
  }

  private async reviewMergedOnMaster(
    review: ReviewWithRelations,
  ): Promise<boolean> {
    if (review.commits.length === 0) {
      return false;
    }

    const metadata = this.metadataFromUrl(review.gitwebUrl);
    if (!metadata.remoteUrl) {
      return false;
    }

    const repoPath = await this.ensureGitCache(metadata.remoteUrl);
    await this.runGit([
      "-C",
      repoPath,
      "fetch",
      "--depth=300",
      metadata.remoteUrl,
      "+refs/remotes/origin/master:refs/gwr/master",
    ]);

    for (const commit of review.commits) {
      await this.runGit([
        "-C",
        repoPath,
        "fetch",
        "--depth=2",
        metadata.remoteUrl,
        commit.hash,
      ]);

      // "git cherry" marks the commit with "-" when a patch-equivalent
      // commit exists upstream, which also covers rebased commits.
      const cherry = await this.runGit([
        "-C",
        repoPath,
        "cherry",
        "refs/gwr/master",
        commit.hash,
        `${commit.hash}~1`,
      ]);
      const lines = cherry.split("\n").filter((line) => line.trim());
      if (lines.some((line) => line.startsWith("+"))) {
        return false;
      }
    }

    return true;
  }

  async update(
    user: User,
    reviewId: string,
    dto: UpdateReviewDto,
  ): Promise<ReviewResponseDto> {
    const existingReview = await this.findReviewOrThrow(reviewId);
    if (this.hasOwnerOnlyUpdate(dto)) {
      this.assertIsOwner(user, existingReview);
    }

    const reviewerUserIds = dto.reviewerUserIds
      ? await this.validReviewerUserIds(dto.reviewerUserIds, user.id)
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
        data: {},
        include: reviewInclude,
      });
    });

    await this.notifyReviewers(review, addedReviewerIds);
    return this.toResponse(review);
  }

  async delete(
    user: User,
    reviewId: string,
  ): Promise<ReviewDeletionResponseDto> {
    const existingReview = await this.findReviewOrThrow(reviewId);
    this.assertIsOwner(user, existingReview);

    await this.prisma.review.delete({ where: { id: reviewId } });

    return { id: reviewId, deleted: true };
  }

  private async findReviewOrThrow(
    reviewId: string,
  ): Promise<ReviewWithRelations> {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      include: reviewInclude,
    });

    if (!review) {
      throw new AppException(
        ErrorCode.REVIEW_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        "Review not found",
      );
    }

    return review;
  }

  private assertCanRead(user: User, review: ReviewWithRelations): void {
    if (
      user.role === UserRole.ADMIN ||
      review.ownerId === user.id ||
      review.reviewers.some((reviewer) => reviewer.userId === user.id)
    ) {
      return;
    }

    throw new AppException(
      ErrorCode.ROLE_FORBIDDEN,
      HttpStatus.FORBIDDEN,
      "Review access forbidden",
    );
  }

  private assertCanUpdate(user: User, review: ReviewWithRelations): void {
    if (user.role === UserRole.ADMIN || review.ownerId === user.id) {
      return;
    }

    throw new AppException(
      ErrorCode.ROLE_FORBIDDEN,
      HttpStatus.FORBIDDEN,
      "Only the review owner can update this review",
    );
  }

  private assertIsOwner(user: User, review: ReviewWithRelations): void {
    if (review.ownerId === user.id) {
      return;
    }

    throw new AppException(
      ErrorCode.ROLE_FORBIDDEN,
      HttpStatus.FORBIDDEN,
      "Only the review owner can update review details",
    );
  }

  private assertIsReviewer(user: User, review: ReviewWithRelations): void {
    if (review.reviewers.some((reviewer) => reviewer.userId === user.id)) {
      return;
    }

    throw new AppException(
      ErrorCode.ROLE_FORBIDDEN,
      HttpStatus.FORBIDDEN,
      "Only a review reviewer can update the review status",
    );
  }

  private assertCanResolveComment(
    user: User,
    review: ReviewWithRelations,
  ): void {
    if (
      review.ownerId === user.id ||
      review.reviewers.some((reviewer) => reviewer.userId === user.id)
    ) {
      return;
    }

    throw new AppException(
      ErrorCode.ROLE_FORBIDDEN,
      HttpStatus.FORBIDDEN,
      "Only the review owner or reviewers can mark comments as done",
    );
  }

  private async updateReviewStatusAfterComment(
    user: User,
    review: ReviewWithRelations,
  ): Promise<void> {
    if (review.status === ReviewStatus.CLOSED) {
      return;
    }

    await this.refreshReviewStatusFromComments(review.id, user.id);
  }

  private async refreshReviewStatusFromComments(
    reviewId: string,
    actorId: string,
  ): Promise<ReviewWithRelations> {
    const review = await this.findReviewOrThrow(reviewId);
    if (review.status === ReviewStatus.CLOSED) {
      return review;
    }

    const totalGroups = await this.prisma.reviewComment.groupBy({
      by: ["commitHash"],
      where: { reviewId },
      _count: { _all: true },
    });
    const totalCounts = new Map(
      totalGroups.map((group) => [group.commitHash, group._count._all]),
    );

    const nextCommitStatuses: ReviewCommitStatus[] = [];
    for (const commit of review.commits) {
      const totalCount = totalCounts.get(commit.hash) ?? 0;
      const hasAck = commit.acks.length > 0;
      const nextStatus = hasAck
        ? ReviewCommitStatus.ACKED
        : commit.status === ReviewCommitStatus.REVIEWED
          ? ReviewCommitStatus.REVIEWED
          : totalCount > 0
            ? ReviewCommitStatus.IN_REVIEW
            : ReviewCommitStatus.PENDING;
      nextCommitStatuses.push(nextStatus);
      if (nextStatus !== commit.status) {
        await this.prisma.reviewCommit.update({
          where: { id: commit.id },
          data: { status: nextStatus },
        });
      }
    }

    const totalCommentCount = [...totalCounts.values()].reduce(
      (sum, count) => sum + count,
      0,
    );
    const allCommitsAcked =
      nextCommitStatuses.length > 0 &&
      nextCommitStatuses.every((status) => status === ReviewCommitStatus.ACKED);
    const allCommitsReviewed =
      nextCommitStatuses.length > 0 &&
      nextCommitStatuses.every(
        (status) =>
          status === ReviewCommitStatus.ACKED ||
          status === ReviewCommitStatus.REVIEWED,
      );
    const anyActivity =
      totalCommentCount > 0 ||
      nextCommitStatuses.some(
        (status) => status !== ReviewCommitStatus.PENDING,
      );
    const nextStatus = allCommitsAcked
      ? ReviewStatus.ACKED
      : allCommitsReviewed
        ? ReviewStatus.REVIEWED
        : anyActivity
          ? ReviewStatus.IN_REVIEW
          : ReviewStatus.PENDING;

    if (nextStatus === review.status) {
      return this.findReviewOrThrow(reviewId);
    }

    return this.updateReviewStatus(
      reviewId,
      nextStatus,
      review.status,
      actorId,
    );
  }

  private async updateReviewStatus(
    reviewId: string,
    nextStatus: ReviewStatus,
    previousStatus: ReviewStatus,
    actorId: string,
  ): Promise<ReviewWithRelations> {
    const review = await this.prisma.review.update({
      where: { id: reviewId },
      data: { status: nextStatus },
      include: reviewInclude,
    });

    await this.notifyReviewStatusChanged(
      review,
      previousStatus,
      review.status,
      actorId,
    );

    return review;
  }

  private hasOwnerOnlyUpdate(dto: UpdateReviewDto): boolean {
    return dto.reviewerUserIds !== undefined;
  }

  private async validReviewerUserIds(
    userIds: string[],
    ownerId: string,
  ): Promise<string[]> {
    const uniqueReviewerIds = [...new Set(userIds)].filter(
      (userId) => userId !== ownerId,
    );
    if (uniqueReviewerIds.length === 0) {
      return [];
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueReviewerIds } },
      select: { id: true },
    });

    if (users.length !== uniqueReviewerIds.length) {
      throw new AppException(
        ErrorCode.USER_NOT_FOUND,
        HttpStatus.BAD_REQUEST,
        "One or more reviewers were not found",
      );
    }

    return uniqueReviewerIds;
  }

  private async ensureReviewerUsersByEmails(
    emails: string[],
    ownerId: string,
  ): Promise<ReviewWithRelations["owner"][]> {
    const uniqueEmails = [
      ...new Set(emails.map((email) => email.toLowerCase())),
    ];
    if (uniqueEmails.length === 0) {
      return [];
    }

    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { email: true },
    });
    const reviewerEmails = uniqueEmails.filter(
      (email) => email !== owner?.email.toLowerCase(),
    );

    await Promise.all(
      reviewerEmails.map((email) =>
        this.prisma.user.upsert({
          where: { email },
          update: {},
          create: {
            firebaseUid: `${placeholderFirebaseUidPrefix}${email}`,
            email,
            hostname: email.split("@")[0] ?? email,
          },
        }),
      ),
    );

    return this.prisma.user.findMany({
      where: { email: { in: reviewerEmails }, id: { not: ownerId } },
      select: userSummarySelect,
      orderBy: { email: "asc" },
    });
  }

  private async notifyReviewers(
    review: ReviewWithRelations,
    reviewerUserIds: string[],
  ): Promise<void> {
    if (reviewerUserIds.length === 0) {
      return;
    }

    const payload = {
      reviewId: review.id,
      title: review.title,
      gitwebUrl: review.gitwebUrl,
      ownerEmail: review.owner.email,
      sourceProject: review.sourceProject,
      sourceBranch: review.sourceBranch,
      sourceCommit: review.sourceCommit,
      gitwebTitle: review.gitwebTitle,
    } satisfies Prisma.InputJsonObject;

    await Promise.all(
      reviewerUserIds.map((userId) =>
        this.notifications.createForUser(
          userId,
          NotificationType.REVIEW_PENDING,
          payload,
        ),
      ),
    );
  }

  private async notifyCommitsReviewed(
    review: ReviewWithRelations,
    commitTitles: string[],
    actorUserId: string,
  ): Promise<void> {
    if (review.ownerId === actorUserId || commitTitles.length === 0) {
      return;
    }

    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: userSummarySelect,
    });
    const payload = {
      reviewId: review.id,
      title: review.title,
      gitwebUrl: review.gitwebUrl,
      ownerEmail: review.owner.email,
      sourceProject: review.sourceProject,
      sourceBranch: review.sourceBranch,
      sourceCommit: review.sourceCommit,
      gitwebTitle: review.gitwebTitle,
      commitCount: commitTitles.length,
      commitTitles: commitTitles.join("\n"),
      actorEmail: actor?.email ?? null,
      actorNickname: actor?.settings?.nickname ?? null,
    } satisfies Prisma.InputJsonObject;

    await this.notifications.createForUser(
      review.ownerId,
      NotificationType.COMMIT_REVIEWED,
      payload,
    );
  }

  private async notifyCommentReceived(
    review: ReviewWithRelations,
    comment: {
      commitHash: string | null;
      filePath: string | null;
      lineNumber: number | null;
    },
    message: string,
    actorUserId: string,
  ): Promise<void> {
    if (review.ownerId === actorUserId) {
      return;
    }

    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: userSummarySelect,
    });
    const payload = {
      reviewId: review.id,
      title: review.title,
      gitwebUrl: review.gitwebUrl,
      ownerEmail: review.owner.email,
      sourceProject: review.sourceProject,
      sourceBranch: review.sourceBranch,
      sourceCommit: review.sourceCommit,
      gitwebTitle: review.gitwebTitle,
      commitHash: comment.commitHash,
      filePath: comment.filePath,
      lineNumber: comment.lineNumber,
      commentExcerpt:
        message.length > 300 ? `${message.slice(0, 300)}...` : message,
      actorEmail: actor?.email ?? null,
      actorNickname: actor?.settings?.nickname ?? null,
    } satisfies Prisma.InputJsonObject;

    await this.notifications.createForUser(
      review.ownerId,
      NotificationType.COMMENT_RECEIVED,
      payload,
    );
  }

  private async notifyReviewStatusChanged(
    review: ReviewWithRelations,
    previousStatus: ReviewStatus,
    nextStatus: ReviewStatus,
    actorUserId: string,
  ): Promise<void> {
    const recipientUserIds = [
      ...new Set([
        review.ownerId,
        ...review.reviewers.map((reviewer) => reviewer.userId),
      ]),
    ].filter((userId) => userId !== actorUserId);

    if (recipientUserIds.length === 0) {
      return;
    }

    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: userSummarySelect,
    });
    const payload = {
      reviewId: review.id,
      title: review.title,
      gitwebUrl: review.gitwebUrl,
      ownerEmail: review.owner.email,
      sourceProject: review.sourceProject,
      sourceBranch: review.sourceBranch,
      sourceCommit: review.sourceCommit,
      gitwebTitle: review.gitwebTitle,
      previousStatus,
      nextStatus,
      actorEmail: actor?.email ?? null,
      actorNickname: actor?.settings?.nickname ?? null,
    } satisfies Prisma.InputJsonObject;

    await Promise.all(
      recipientUserIds.map((userId) =>
        this.notifications.createForUser(
          userId,
          NotificationType.REVIEW_STATUS_CHANGED,
          payload,
        ),
      ),
    );
  }

  private toResponse(review: ReviewWithRelations): ReviewResponseDto {
    const { gitwebRawHtml: _gitwebRawHtml, ...reviewWithoutRawHtml } = review;

    return {
      ...reviewWithoutRawHtml,
      gitwebRawHtml: null,
      gitDiff: this.gitDiffFromSnapshot(review.gitwebSnapshot),
      owner: this.toUserSummary(review.owner),
      commits: review.commits.map((commit) => ({
        ...commit,
        gitDiff: this.gitDiffFromJson(commit.gitDiff),
        acks: commit.acks.map((ack) => ({
          ...ack,
          user: this.toUserSummary(ack.user),
        })),
      })),
      reviewers: review.reviewers.map((reviewer) => ({
        ...reviewer,
        user: this.toUserSummary(reviewer.user),
      })),
    };
  }

  private toCommentResponses(
    comment: ReviewCommentWithMessages,
  ): ReviewCommentResponseDto[] {
    return comment.messages.map((message) => ({
      id: message.id,
      commentId: comment.id,
      reviewId: comment.reviewId,
      commitHash: comment.commitHash,
      filePath: comment.filePath,
      lineNumber: comment.lineNumber,
      side: comment.side,
      author: this.toUserSummary(message.from),
      done: comment.done,
      doneBy: comment.doneBy ? this.toUserSummary(comment.doneBy) : null,
      doneAt: comment.doneAt,
      message: message.message,
      createdAt: message.createdAt,
    }));
  }

  private toUserSummary(user: UserSummary) {
    return {
      id: user.id,
      email: user.email,
      hostname: user.hostname,
      nickname: user.settings?.nickname ?? null,
      mailNotificationsEnabled:
        user.settings?.mailNotificationsEnabled ?? false,
      ircNotificationsEnabled: user.settings?.ircNotificationsEnabled ?? false,
      hasProfileImage: !!user.profileImage,
    };
  }

  private nullIfBlank(value?: string | null): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private async fetchGitwebMetadata(
    gitwebUrl: string,
  ): Promise<GitwebMetadata> {
    const baseMetadata = this.metadataFromUrl(gitwebUrl);

    try {
      if (!baseMetadata.remoteUrl) {
        throw new Error("Missing git remote URL in git-web URL");
      }

      if (baseMetadata.linkKind === "SUMMARY") {
        const branch = baseMetadata.sourceBranch ?? "master";
        const { options, reviewerEmails } =
          await this.fetchGitBranchCommitOptions(
            baseMetadata.remoteUrl,
            branch,
          );
        const metadata = {
          ...baseMetadata,
          title: options.length
            ? `${branch} (${options.length} commits)`
            : baseMetadata.title,
          log: this.truncate(
            options.map((option) => option.title).join("\n"),
            20000,
          ),
          rawHtml: null,
          sourceCommit: options[0]?.hash ?? null,
          reviewerEmails,
          commitOptions: options,
          gitDiff: { files: [] },
          fetchedAt: new Date(),
          fetchError: options.length
            ? null
            : `No commits to review on branch "${branch}": it has no commits ahead of origin/master. Push your local commits to this branch, then retry.`,
        } satisfies Omit<GitwebMetadata, "snapshot">;

        return {
          ...metadata,
          snapshot: this.snapshotFromMetadata(metadata, null),
        };
      }

      if (!baseMetadata.sourceCommit) {
        throw new Error("Missing git remote URL or commit hash in git-web URL");
      }

      const commitMetadata = await this.fetchGitCommitMetadata(
        baseMetadata.remoteUrl,
        baseMetadata.sourceCommit,
      );
      const metadata = {
        ...baseMetadata,
        title: commitMetadata.title,
        description: this.descriptionFromGitBody(commitMetadata.body),
        log: this.truncate(commitMetadata.message, 20000),
        rawHtml: null,
        sourceCommit: commitMetadata.hash,
        reviewerEmails: this.extractReviewerEmails(commitMetadata.message),
        gitDiff: commitMetadata.gitDiff,
        fetchedAt: new Date(),
        fetchError: null,
      } satisfies Omit<GitwebMetadata, "snapshot">;

      return {
        ...metadata,
        snapshot: this.snapshotFromMetadata(metadata, null),
      };
    } catch (error) {
      const fetchError =
        error instanceof Error ? error.message : "Fetch failed";
      return {
        ...baseMetadata,
        snapshot: this.snapshotFromMetadata(baseMetadata, null),
        fetchedAt: new Date(),
        fetchError,
      };
    }
  }

  private metadataFromUrl(gitwebUrl: string): GitwebMetadata {
    const url = new URL(gitwebUrl);
    const params = this.gitwebParams(url);
    const action = params.get("a")?.toLowerCase() ?? null;
    const linkKind: GitwebLinkKind =
      action && ["summary", "shortlog", "log", "heads", "tree"].includes(action)
        ? "SUMMARY"
        : "COMMIT";
    const project =
      params.get("p") ??
      params.get("project") ??
      this.nullIfBlank(url.pathname.split("/").filter(Boolean)[0]);
    const head =
      params.get("h") ??
      params.get("id") ??
      params.get("commit") ??
      this.nullIfBlank(url.pathname.split("/").filter(Boolean).at(-1));
    const branchParam = this.nullIfBlank(
      params.get("hb") ?? params.get("branch"),
    );

    return {
      linkKind,
      title: null,
      description: null,
      log: null,
      rawHtml: null,
      remoteUrl: project ? `git://${url.host}/${project}` : null,
      sourceProject: this.nullIfBlank(project),
      sourceBranch:
        linkKind === "SUMMARY"
          ? (this.nullIfBlank(head) ?? branchParam ?? "master")
          : (branchParam ?? "master"),
      sourceCommit: linkKind === "SUMMARY" ? null : this.nullIfBlank(head),
      reviewerEmails: [],
      commitOptions: [],
      gitDiff: { files: [] },
      snapshot: null,
      fetchedAt: null,
      fetchError: null,
    };
  }

  private gitwebParams(url: URL): Map<string, string> {
    const params = new Map<string, string>();

    for (const entry of url.search.slice(1).split(/[&;]/)) {
      const [rawKey, ...rawValueParts] = entry.split("=");
      if (!rawKey) {
        continue;
      }
      const rawValue = rawValueParts.join("=");
      params.set(
        this.decodeUrlComponent(rawKey),
        this.decodeUrlComponent(rawValue),
      );
    }

    return params;
  }

  private decodeUrlComponent(value: string): string {
    return decodeURIComponent(value.replace(/\+/g, " "));
  }

  private async fetchGitCommitMetadata(
    remoteUrl: string,
    commitHash: string,
  ): Promise<GitCommitMetadata> {
    const repoPath = await this.ensureGitCache(remoteUrl);

    await this.runGit([
      "-C",
      repoPath,
      "fetch",
      "--depth=2",
      remoteUrl,
      commitHash,
    ]);

    const commitOutput = await this.runGit([
      "-C",
      repoPath,
      "show",
      "-s",
      "--format=%H%x00%an%x00%ae%x00%s%x00%b",
      "FETCH_HEAD",
    ]);
    const [hash, authorName, authorEmail, title, body = ""] =
      commitOutput.split("\0");
    const patch = await this.runGit([
      "-C",
      repoPath,
      "show",
      "--format=",
      "--find-renames",
      "--find-copies",
      "--no-ext-diff",
      "--no-color",
      "FETCH_HEAD",
    ]);
    const message = [title.trim(), body.trim()].filter(Boolean).join("\n\n");

    return {
      hash: hash.trim(),
      title: title.trim(),
      body,
      message,
      authorName: authorName.trim(),
      authorEmail: authorEmail.trim(),
      gitDiff: { files: this.parseGitPatch(patch) },
    };
  }

  private async fetchGitBranchCommitOptions(
    remoteUrl: string,
    branch: string,
  ): Promise<{ options: GitCommitOption[]; reviewerEmails: string[] }> {
    const repoPath = await this.ensureGitCache(remoteUrl);

    await this.runGit([
      "-C",
      repoPath,
      "fetch",
      "--depth=50",
      remoteUrl,
      `+${branch}:refs/gwr/head`,
    ]);

    let upstreamRef: string | null = "refs/gwr/origin";
    try {
      await this.runGit([
        "-C",
        repoPath,
        "fetch",
        "--depth=50",
        remoteUrl,
        "+refs/remotes/origin/master:refs/gwr/origin",
      ]);
    } catch {
      upstreamRef = null;
    }

    const logOutput = await this.runGit([
      "-C",
      repoPath,
      "log",
      "--max-count=20",
      "--format=%H%x00%an%x00%ae%x00%aI%x00%s%x00%b%x1e",
      upstreamRef ? `${upstreamRef}..refs/gwr/head` : "refs/gwr/head",
    ]);

    const options: GitCommitOption[] = [];
    const reviewerEmails = new Set<string>();
    for (const record of logOutput.split("\x1e")) {
      const [hash, authorName, authorEmail, authoredAt, title, body = ""] =
        record.replace(/^\n/, "").split("\0");
      if (!hash?.trim()) {
        continue;
      }
      options.push({
        hash: hash.trim(),
        title: title?.trim() ?? hash.trim(),
        authorName: authorName?.trim() ?? "",
        authorEmail: authorEmail?.trim() ?? "",
        authoredAt: authoredAt?.trim() || null,
      });
      for (const email of this.extractReviewerEmails(body)) {
        reviewerEmails.add(email);
      }
    }

    return { options, reviewerEmails: [...reviewerEmails] };
  }

  private async commitCreatesFromMetadata(
    metadata: GitwebMetadata,
    selectedHashes?: string[],
  ): Promise<Prisma.ReviewCommitCreateWithoutReviewInput[]> {
    if (metadata.linkKind === "SUMMARY") {
      if (!metadata.remoteUrl || metadata.commitOptions.length === 0) {
        return [];
      }

      const normalizedSelection = selectedHashes?.map((hash) =>
        hash.toLowerCase(),
      );
      const selected = normalizedSelection?.length
        ? metadata.commitOptions.filter((option) =>
            normalizedSelection.some((hash) =>
              option.hash.toLowerCase().startsWith(hash),
            ),
          )
        : metadata.commitOptions;
      if (selected.length === 0) {
        throw new AppException(
          ErrorCode.UNKNOWN_ERROR,
          HttpStatus.BAD_REQUEST,
          "No matching commits selected for the review",
        );
      }

      const orderedOldestFirst = [...selected].reverse();
      const creates: Prisma.ReviewCommitCreateWithoutReviewInput[] = [];
      for (const [index, option] of orderedOldestFirst.entries()) {
        const commitMetadata = await this.fetchGitCommitMetadata(
          metadata.remoteUrl,
          option.hash,
        );
        creates.push(this.commitCreateFromGitMetadata(commitMetadata, index));
      }
      return creates;
    }

    if (!metadata.sourceCommit) {
      return [];
    }

    return [
      {
        ...this.commitFromMetadata(metadata, metadata.title),
        position: 0,
        gitDiff: metadata.gitDiff as unknown as Prisma.InputJsonObject,
      },
    ];
  }

  private commitCreateFromGitMetadata(
    metadata: GitCommitMetadata,
    position: number,
  ): Prisma.ReviewCommitCreateWithoutReviewInput {
    const signedOffBy = this.signedOffByFromLog(metadata.message);

    return {
      hash: metadata.hash,
      title: metadata.title,
      position,
      signedOffByName:
        signedOffBy.name !== "unknown" ? signedOffBy.name : metadata.authorName,
      signedOffByEmail: signedOffBy.email || metadata.authorEmail,
      fixesHash: this.firstMatch(
        metadata.message,
        /Fixes:\s*([0-9a-f]{7,40})/i,
      ),
      fixesTitle: null,
      rawMessage: this.truncate(metadata.message, 20000) ?? metadata.title,
      gitDiff: metadata.gitDiff as unknown as Prisma.InputJsonObject,
    };
  }

  private async ensureGitCache(remoteUrl: string): Promise<string> {
    const repoKey = createHash("sha256").update(remoteUrl).digest("hex");
    const repoPath = join(gitCacheDirectory, `${repoKey}.git`);

    await mkdir(gitCacheDirectory, { recursive: true });
    try {
      await this.runGit(["-C", repoPath, "rev-parse", "--is-bare-repository"]);
    } catch {
      await this.runGit(["init", "--bare", repoPath]);
    }

    return repoPath;
  }

  private async runGit(args: string[]): Promise<string> {
    const { stdout } = await execFileAsync("git", args, {
      encoding: "utf8",
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      maxBuffer: 50 * 1024 * 1024,
      timeout: 120000,
    });

    return stdout;
  }

  private parseGitPatch(patch: string): ReviewDiffResponseDto["files"] {
    const sections = patch
      .split(/(?=^diff --git )/gm)
      .map((section) => section.trimEnd())
      .filter(Boolean);

    return sections.map((section) => {
      const lines = section.split("\n");
      const headerMatch = lines[0].match(/^diff --git a\/(.+) b\/(.+)$/);
      let path = headerMatch?.[2] ?? "unknown";
      let oldPath: string | null = null;
      let status = "MODIFIED";
      let additions = 0;
      let deletions = 0;

      for (const line of lines) {
        if (line === "new file mode 100644") {
          status = "ADDED";
        } else if (line.startsWith("deleted file mode")) {
          status = "DELETED";
        } else if (line.startsWith("rename from ")) {
          oldPath = line.slice("rename from ".length);
          status = "RENAMED";
        } else if (line.startsWith("rename to ")) {
          path = line.slice("rename to ".length);
          status = "RENAMED";
        } else if (line.startsWith("+") && !line.startsWith("+++")) {
          additions += 1;
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          deletions += 1;
        }
      }

      return {
        path,
        oldPath,
        status,
        additions,
        deletions,
        patch: this.truncate(section, 200000) ?? "",
      };
    });
  }

  private descriptionFromGitBody(body: string): string | null {
    const descriptionLines: string[] = [];

    for (const line of body.replace(/\r/g, "").split("\n")) {
      const trimmedLine = line.trim();
      if (descriptionLines.length === 0 && trimmedLine === "") {
        continue;
      }
      if (this.isGitTrailerOrReference(trimmedLine)) {
        break;
      }
      descriptionLines.push(line);
    }

    while (descriptionLines.at(-1)?.trim() === "") {
      descriptionLines.pop();
    }

    return this.truncate(descriptionLines.join("\n"), 4000);
  }

  private isGitTrailerOrReference(line: string): boolean {
    return /^(?:Fixes|Signed-off-by|Acked-by|Reviewed-by|Tested-by|Cc|To):\s+/i.test(
      line,
    );
  }

  private metadataFromHtml(html: string) {
    const title = this.decodeHtml(
      this.firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
    );
    const description = this.decodeHtml(
      this.firstMatch(
        html,
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
      ),
    );
    const text = this.htmlToText(html);
    const sourceCommit = this.firstMatch(
      text,
      /\b(?:commit|commitdiff)\s+([0-9a-f]{7,40})\b/i,
    );
    const reviewerEmails = this.extractReviewerEmails(text);

    return {
      title: this.truncate(title, 240),
      description: this.truncate(description, 4000),
      log: this.truncate(text, 20000),
      sourceCommit,
      reviewerEmails,
    };
  }

  private commitFromMetadata(metadata: GitwebMetadata, title: string | null) {
    const signedOffBy = this.signedOffByFromLog(metadata.log);

    return {
      hash: metadata.sourceCommit!,
      title:
        title ??
        this.firstNonEmptyLine(metadata.log) ??
        metadata.title ??
        metadata.sourceCommit!,
      signedOffByName: signedOffBy.name,
      signedOffByEmail: signedOffBy.email,
      fixesHash: this.firstMatch(
        metadata.log ?? "",
        /Fixes:\s*([0-9a-f]{7,40})/i,
      ),
      fixesTitle: null,
      rawMessage: metadata.log ?? title ?? metadata.sourceCommit!,
    } satisfies Prisma.ReviewCommitCreateWithoutReviewInput;
  }

  private snapshotFromMetadata(
    metadata: Omit<GitwebMetadata, "snapshot">,
    html: string | null,
  ): Prisma.InputJsonObject {
    return {
      title: metadata.title,
      description: metadata.description,
      remoteUrl: metadata.remoteUrl,
      sourceProject: metadata.sourceProject,
      sourceBranch: metadata.sourceBranch,
      sourceCommit: metadata.sourceCommit,
      reviewerEmails: metadata.reviewerEmails,
      gitDiff: metadata.gitDiff as unknown as Prisma.InputJsonObject,
      logLength: metadata.log?.length ?? 0,
      htmlLength: html?.length ?? 0,
      fetchedAt: metadata.fetchedAt?.toISOString() ?? null,
      fetchError: metadata.fetchError,
    };
  }

  private gitDiffFromSnapshot(
    snapshot: Prisma.JsonValue | null,
  ): ReviewDiffResponseDto {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
      return { files: [] };
    }

    return this.gitDiffFromJson(
      (snapshot as Record<string, unknown>).gitDiff as Prisma.JsonValue,
    );
  }

  private gitDiffFromJson(
    gitDiff: Prisma.JsonValue | null,
  ): ReviewDiffResponseDto {
    if (!gitDiff || typeof gitDiff !== "object" || Array.isArray(gitDiff)) {
      return { files: [] };
    }

    const files = (gitDiff as Record<string, unknown>).files;
    if (!Array.isArray(files)) {
      return { files: [] };
    }

    return { files: files.filter((file) => this.isReviewDiffFile(file)) };
  }

  private isReviewDiffFile(
    file: unknown,
  ): file is ReviewDiffResponseDto["files"][number] {
    if (!file || typeof file !== "object" || Array.isArray(file)) {
      return false;
    }
    const value = file as Record<string, unknown>;
    return (
      typeof value.path === "string" &&
      (typeof value.oldPath === "string" || value.oldPath === null) &&
      typeof value.status === "string" &&
      typeof value.additions === "number" &&
      typeof value.deletions === "number" &&
      typeof value.patch === "string"
    );
  }

  private htmlToText(html: string): string {
    return (
      this.decodeHtml(
        html
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<\/(p|div|tr|li|pre|table|h\d)>/gi, "\n")
          .replace(/<[^>]+>/g, " ")
          .replace(/\r/g, "")
          .replace(/[ \t]+/g, " ")
          .replace(/\n[ \t]+/g, "\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim(),
      ) ?? ""
    );
  }

  private firstMatch(value: string, regex: RegExp): string | null;
  private firstMatch(
    value: string | null | undefined,
    regex: RegExp,
  ): string | null;
  private firstMatch(
    value: string | null | undefined,
    regex: RegExp,
  ): string | null {
    return value?.match(regex)?.[1]?.trim() ?? null;
  }

  private firstNonEmptyLine(value?: string | null): string | null {
    return (
      value
        ?.split("\n")
        .map((line) => line.trim())
        .find(Boolean) ?? null
    );
  }

  private signedOffByFromLog(log?: string | null) {
    const signedOffBy = log?.match(
      /Signed-off-by:\s*([^<\n]+?)\s*<([^>\n]+)>/i,
    );
    const author = log?.match(/Author:\s*([^<\n]+?)\s*<([^>\n]+)>/i);
    const match = signedOffBy ?? author;

    return {
      name: match?.[1]?.trim() ?? "unknown",
      email: match?.[2]?.trim() ?? "",
    };
  }

  private extractReviewerEmails(text?: string | null): string[] {
    if (!text) {
      return [];
    }

    const reviewerEmails = new Set<string>();
    const trailerRegex =
      /^(?:Reviewer|Reviewers|Reviewed-by|Acked-by|Tested-by|Cc|To):\s*[^<\n]*<([^>\n]+)>/gim;
    for (const match of text.matchAll(trailerRegex)) {
      reviewerEmails.add(match[1].trim().toLowerCase());
    }

    return [...reviewerEmails];
  }

  private decodeHtml(value?: string | null): string | null {
    if (!value) {
      return null;
    }

    return value
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  private truncate(
    value: string | null | undefined,
    maxLength: number,
  ): string | null {
    if (!value) {
      return null;
    }

    return value.length > maxLength ? value.slice(0, maxLength) : value;
  }
}
