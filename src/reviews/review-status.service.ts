import { Injectable } from "@nestjs/common";
import { ReviewCommitStatus, ReviewStatus, type User } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ReviewNotificationsService } from "./review-notifications.service";
import {
  findReviewOrThrow,
  reviewInclude,
  type ReviewWithRelations,
} from "./review-queries";

/**
 * Derives commit and review statuses from comments, acks and reviews, and
 * stores them when they changed.
 */
@Injectable()
export class ReviewStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reviewNotifications: ReviewNotificationsService,
  ) {}

  async updateAfterComment(
    user: User,
    review: ReviewWithRelations,
  ): Promise<void> {
    if (review.status === ReviewStatus.CLOSED) {
      return;
    }

    await this.refreshFromComments(review.id, user.id);
  }

  async refreshFromComments(
    reviewId: string,
    actorId: string,
  ): Promise<ReviewWithRelations> {
    const review = await findReviewOrThrow(this.prisma, reviewId);
    if (review.status === ReviewStatus.CLOSED) {
      return review;
    }

    const totalCounts = await this.commentCountsByCommit(reviewId);
    const nextCommitStatuses = await this.refreshCommitStatuses(
      review,
      totalCounts,
    );
    const totalCommentCount = [...totalCounts.values()].reduce(
      (sum, count) => sum + count,
      0,
    );
    const nextStatus = reviewStatusFrom(nextCommitStatuses, totalCommentCount);

    if (nextStatus === review.status) {
      return findReviewOrThrow(this.prisma, reviewId);
    }

    return this.updateStatus(reviewId, nextStatus, review.status, actorId);
  }

  private async commentCountsByCommit(
    reviewId: string,
  ): Promise<Map<string | null, number>> {
    const totalGroups = await this.prisma.reviewComment.groupBy({
      by: ["commitHash"],
      where: { reviewId },
      _count: { _all: true },
    });
    return new Map(
      totalGroups.map((group) => [group.commitHash, group._count._all]),
    );
  }

  private async refreshCommitStatuses(
    review: ReviewWithRelations,
    totalCounts: Map<string | null, number>,
  ): Promise<ReviewCommitStatus[]> {
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
    return nextCommitStatuses;
  }

  private async updateStatus(
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

    await this.reviewNotifications.notifyReviewStatusChanged(
      review,
      previousStatus,
      review.status,
      actorId,
    );

    return review;
  }
}

function reviewStatusFrom(
  commitStatuses: ReviewCommitStatus[],
  totalCommentCount: number,
): ReviewStatus {
  const allCommitsAcked =
    commitStatuses.length > 0 &&
    commitStatuses.every((status) => status === ReviewCommitStatus.ACKED);
  const allCommitsReviewed =
    commitStatuses.length > 0 &&
    commitStatuses.every(
      (status) =>
        status === ReviewCommitStatus.ACKED ||
        status === ReviewCommitStatus.REVIEWED,
    );
  const anyActivity =
    totalCommentCount > 0 ||
    commitStatuses.some((status) => status !== ReviewCommitStatus.PENDING);

  return allCommitsAcked
    ? ReviewStatus.ACKED
    : allCommitsReviewed
      ? ReviewStatus.REVIEWED
      : anyActivity
        ? ReviewStatus.IN_REVIEW
        : ReviewStatus.PENDING;
}
