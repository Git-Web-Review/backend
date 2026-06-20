import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { HttpStatus, Injectable } from "@nestjs/common";
import {
  NotificationType,
  Prisma,
  ReviewStatus,
  UserRole,
  type User,
} from "@prisma/client";
import { AppException } from "../common/app.exception";
import { ErrorCode } from "../common/error-code.enum";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateReviewCommentDto } from "./dto/create-review-comment.dto";
import { CreateReviewDto } from "./dto/create-review.dto";
import { PreviewReviewDto } from "./dto/preview-review.dto";
import { ReviewCommentResponseDto } from "./dto/review-comment-response.dto";
import { ReviewDashboardQueryDto } from "./dto/review-dashboard-query.dto";
import { ReviewDashboardResponseDto } from "./dto/review-dashboard-response.dto";
import { ReviewDeletionResponseDto } from "./dto/review-deletion-response.dto";
import { ReviewDiffResponseDto } from "./dto/review-diff-file-response.dto";
import { ReviewPreviewResponseDto } from "./dto/review-preview-response.dto";
import { ReviewResponseDto } from "./dto/review-response.dto";
import { UpdateReviewCommentDto } from "./dto/update-review-comment.dto";
import { UpdateReviewDto } from "./dto/update-review.dto";

type GitwebMetadata = {
  title: string | null;
  description: string | null;
  log: string | null;
  rawHtml: string | null;
  remoteUrl: string | null;
  sourceProject: string | null;
  sourceBranch: string | null;
  sourceCommit: string | null;
  reviewerEmails: string[];
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
  settings: { select: { nickname: true } },
  profileImage: { select: { userId: true } },
} satisfies Prisma.UserSelect;

const reviewInclude = {
  owner: { select: userSummarySelect },
  reviewers: {
    orderBy: { requestedAt: "asc" },
    include: { user: { select: userSummarySelect } },
  },
  commits: { orderBy: { createdAt: "asc" } },
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
      status: ReviewStatus.PENDING,
    } satisfies Prisma.ReviewWhereInput;
    const assignedWhere = {
      status: ReviewStatus.PENDING,
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
    const gitwebMetadata = await this.fetchGitwebMetadata(dto.gitwebUrl);
    const title = this.nullIfBlank(dto.title) ?? gitwebMetadata.title;
    const description =
      this.nullIfBlank(dto.description) ??
      gitwebMetadata.description ??
      gitwebMetadata.log;
    const commit = gitwebMetadata.sourceCommit
      ? this.commitFromMetadata(gitwebMetadata, title)
      : null;

    const createdReview = await this.prisma.review.create({
      data: {
        gitwebUrl: dto.gitwebUrl,
        title,
        description: this.truncate(description, 4000),
        sourceProject: gitwebMetadata.sourceProject,
        sourceBranch: gitwebMetadata.sourceBranch,
        sourceCommit: gitwebMetadata.sourceCommit,
        gitwebTitle: gitwebMetadata.title,
        gitwebLog: gitwebMetadata.log,
        gitwebRawHtml: gitwebMetadata.rawHtml,
        gitwebSnapshot: gitwebMetadata.snapshot ?? Prisma.JsonNull,
        gitwebFetchedAt: gitwebMetadata.fetchedAt,
        gitwebFetchError: gitwebMetadata.fetchError,
        ownerId,
        ...(commit
          ? {
              commits: {
                create: commit,
              },
            }
          : {}),
        reviewers: {
          createMany: {
            data: reviewerUserIds.map((userId) => ({ userId })),
          },
        },
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
        lineNumber: dto.lineNumber,
        messages: {
          create: {
            fromId: user.id,
            message,
          },
        },
      },
      include: reviewCommentInclude,
    });

    return this.toCommentResponses(comment)[0];
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

    return this.toCommentResponses(updatedComment);
  }

  async acknowledge(user: User, reviewId: string): Promise<ReviewResponseDto> {
    const review = await this.findReviewOrThrow(reviewId);
    this.assertIsReviewer(user, review);

    const openCommentCount = await this.prisma.reviewComment.count({
      where: { reviewId, done: false },
    });
    if (openCommentCount > 0) {
      throw new AppException(
        ErrorCode.UNKNOWN_ERROR,
        HttpStatus.BAD_REQUEST,
        "All comments must be done before acknowledging the review",
      );
    }

    await this.prisma.reviewReviewer.update({
      where: { reviewId_userId: { reviewId, userId: user.id } },
      data: { acknowledgedAt: new Date() },
    });

    return this.toResponse(await this.findReviewOrThrow(reviewId));
  }

  async close(user: User, reviewId: string): Promise<ReviewResponseDto> {
    const review = await this.findReviewOrThrow(reviewId);
    this.assertIsOwner(user, review);

    if (review.status === ReviewStatus.CLOSED) {
      return this.toResponse(review);
    }

    if (
      review.reviewers.length === 0 ||
      !review.reviewers.some((reviewer) => reviewer.acknowledgedAt)
    ) {
      throw new AppException(
        ErrorCode.UNKNOWN_ERROR,
        HttpStatus.BAD_REQUEST,
        "At least one reviewer must acknowledge the review before it can be closed",
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

  async update(
    user: User,
    reviewId: string,
    dto: UpdateReviewDto,
  ): Promise<ReviewResponseDto> {
    const existingReview = await this.findReviewOrThrow(reviewId);
    if (this.hasOwnerOnlyUpdate(dto)) {
      this.assertIsOwner(user, existingReview);
    }
    if (dto.status !== undefined) {
      this.assertIsReviewer(user, existingReview);
      this.assertReviewerStatusCanBeUpdated(dto.status);
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
        data: {
          ...(dto.title !== undefined
            ? { title: this.nullIfBlank(dto.title) }
            : {}),
          ...(dto.description !== undefined
            ? { description: this.nullIfBlank(dto.description) }
            : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
        include: reviewInclude,
      });
    });

    await this.notifyReviewers(review, addedReviewerIds);
    if (dto.status !== undefined && existingReview.status !== review.status) {
      await this.notifyReviewStatusChanged(
        review,
        existingReview.status,
        review.status,
        user.id,
      );
    }
    return this.toResponse(review);
  }

  async delete(
    user: User,
    reviewId: string,
  ): Promise<ReviewDeletionResponseDto> {
    const existingReview = await this.findReviewOrThrow(reviewId);
    this.assertCanUpdate(user, existingReview);

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

  private assertReviewerStatusCanBeUpdated(status: ReviewStatus): void {
    if (status !== ReviewStatus.CLOSED) {
      return;
    }

    throw new AppException(
      ErrorCode.ROLE_FORBIDDEN,
      HttpStatus.FORBIDDEN,
      "Close the review with the close endpoint after at least one reviewer acknowledged it",
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

  private hasOwnerOnlyUpdate(dto: UpdateReviewDto): boolean {
    return (
      dto.title !== undefined ||
      dto.description !== undefined ||
      dto.reviewerUserIds !== undefined
    );
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
      if (!baseMetadata.remoteUrl || !baseMetadata.sourceCommit) {
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
    const project =
      params.get("p") ??
      params.get("project") ??
      this.nullIfBlank(url.pathname.split("/").filter(Boolean)[0]);
    const sourceCommit =
      params.get("h") ??
      params.get("id") ??
      params.get("commit") ??
      this.nullIfBlank(url.pathname.split("/").filter(Boolean).at(-1));

    return {
      title: null,
      description: null,
      log: null,
      rawHtml: null,
      remoteUrl: project ? `git://${url.host}/${project}` : null,
      sourceProject: this.nullIfBlank(project),
      sourceBranch:
        this.nullIfBlank(params.get("hb") ?? params.get("branch")) ?? "master",
      sourceCommit: this.nullIfBlank(sourceCommit),
      reviewerEmails: [],
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

    const gitDiff = (snapshot as Record<string, unknown>).gitDiff;
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
