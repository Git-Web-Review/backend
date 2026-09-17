import { HttpStatus, Injectable } from "@nestjs/common";
import type { User } from "@prisma/client";
import { AppException } from "../../common/app.exception";
import { ErrorCode } from "../../common/error-code.enum";
import { PrismaService } from "../../prisma/prisma.service";
import { ReviewResponseDto } from "../dto/review-response.dto";
import { ReviewSyncPreviewResponseDto } from "../dto/review-sync-preview-response.dto";
import { SyncReviewDto } from "../dto/sync-review.dto";
import { gitDiffFromJson, remapCommentTarget } from "../git/git-diff";
import { assertIsOwner, assertNotClosed } from "../review-access";
import { ReviewNotificationsService } from "../review-notifications.service";
import { findReviewOrThrow, type ReviewWithRelations } from "../review-queries";
import { ReviewResponsesService } from "../review-responses.service";
import { ReviewStatusService } from "../review-status.service";
import { applySyncPlan, type CommentRemap } from "./apply-sync-plan";
import { modifiedEntries, type SyncPlan } from "./sync-plan";
import { SyncPlannerService } from "./sync-planner.service";

/** New versions of a review, from the current state of its branch. */
@Injectable()
export class ReviewSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly responses: ReviewResponsesService,
    private readonly status: ReviewStatusService,
    private readonly reviewNotifications: ReviewNotificationsService,
    private readonly planner: SyncPlannerService,
  ) {}

  async syncPreview(
    user: User,
    reviewId: string,
  ): Promise<ReviewSyncPreviewResponseDto> {
    const review = await this.syncableReview(user, reviewId);
    const plan = await this.planner.computeSyncPlan(review);

    return {
      reviewId: review.id,
      version: review.version,
      sourceBranch: plan.branch,
      hasChanges: plan.hasChanges,
      commits: plan.entries.map((entry) => ({
        hash: entry.hash,
        title: entry.title,
        changeKind: entry.changeKind,
        previousHash: entry.previous?.hash ?? null,
        previousTitle: entry.previous?.title ?? null,
        authorName: entry.authorName,
        authoredAt: entry.authoredAt,
      })),
      droppedCommits: plan.dropped.map((commit) => ({
        hash: commit.hash,
        title: commit.title,
      })),
    };
  }

  async sync(
    user: User,
    reviewId: string,
    dto: SyncReviewDto,
  ): Promise<ReviewResponseDto> {
    const review = await this.syncableReview(user, reviewId);

    const plan = await this.planner.computeSyncPlan(review, dto.commitHashes);
    if (!plan.hasChanges) {
      throw new AppException(
        ErrorCode.UNKNOWN_ERROR,
        HttpStatus.BAD_REQUEST,
        "The branch has no changes since the current review version",
      );
    }

    const commentRemaps = await this.commentRemaps(reviewId, plan);

    await this.prisma.$transaction((tx) =>
      applySyncPlan(tx, review, plan, commentRemaps, user.id),
    );

    const refreshedReview = await this.status.refreshFromComments(
      reviewId,
      user.id,
    );
    await this.reviewNotifications.notifyNewVersion(
      refreshedReview,
      plan,
      user.id,
    );

    return this.responses.toResponse(refreshedReview);
  }

  private async syncableReview(
    user: User,
    reviewId: string,
  ): Promise<ReviewWithRelations> {
    const review = await findReviewOrThrow(this.prisma, reviewId);
    assertIsOwner(user, review);
    assertNotClosed(review);
    return review;
  }

  /** Where each line comment on a modified commit lands in its new diff. */
  private async commentRemaps(
    reviewId: string,
    plan: SyncPlan,
  ): Promise<CommentRemap[]> {
    const remappedEntries = modifiedEntries(plan).filter(
      (entry) => entry.metadata,
    );
    if (!remappedEntries.length) {
      return [];
    }

    const lineComments = await this.prisma.reviewComment.findMany({
      where: {
        reviewId,
        commitHash: {
          in: remappedEntries.map((entry) => entry.previous!.hash),
        },
        filePath: { not: null },
        lineNumber: { not: null },
      },
      select: {
        id: true,
        commitHash: true,
        filePath: true,
        lineNumber: true,
        side: true,
      },
    });

    const commentRemaps: CommentRemap[] = [];
    for (const comment of lineComments) {
      const entry = remappedEntries.find(
        (candidate) => candidate.previous!.hash === comment.commitHash,
      );
      if (!entry) {
        continue;
      }
      const remapped = remapCommentTarget(
        gitDiffFromJson(entry.previous!.gitDiff),
        entry.metadata!.gitDiff,
        {
          filePath: comment.filePath!,
          lineNumber: comment.lineNumber!,
          side: comment.side,
        },
      );
      commentRemaps.push({
        commentId: comment.id,
        filePath: remapped?.filePath ?? comment.filePath!,
        lineNumber: remapped?.lineNumber ?? null,
      });
    }
    return commentRemaps;
  }
}
