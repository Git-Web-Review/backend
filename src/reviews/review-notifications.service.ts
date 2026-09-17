import { Injectable } from "@nestjs/common";
import {
  NotificationType,
  Prisma,
  ReviewCommitChangeKind,
  ReviewStatus,
} from "@prisma/client";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { mentionedUserIds, replaceMentions } from "./mentions";
import {
  mentionedUsersById,
  userSummarySelect,
  type CommentLocation,
  type ReviewWithRelations,
} from "./review-queries";
import type { SyncPlan } from "./sync/sync-plan";

/** Sends the notifications a review produces as it moves along. */
@Injectable()
export class ReviewNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async notifyReviewers(
    review: ReviewWithRelations,
    reviewerUserIds: string[],
  ): Promise<void> {
    if (reviewerUserIds.length === 0) {
      return;
    }

    const payload = this.reviewPayload(review);

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

  async notifyNewVersion(
    review: ReviewWithRelations,
    plan: SyncPlan,
    actorUserId: string,
  ): Promise<void> {
    const recipientUserIds = review.reviewers
      .map((reviewer) => reviewer.userId)
      .filter((userId) => userId !== actorUserId);
    if (recipientUserIds.length === 0) {
      return;
    }

    const actor = await this.actorPayload(actorUserId);
    const countByKind = (kind: ReviewCommitChangeKind) =>
      plan.entries.filter((entry) => entry.changeKind === kind).length;
    const payload = {
      ...this.reviewPayload(review),
      version: review.version,
      commitCount: plan.entries.length,
      newCount: countByKind(ReviewCommitChangeKind.NEW),
      modifiedCount: countByKind(ReviewCommitChangeKind.MODIFIED),
      rebasedCount: countByKind(ReviewCommitChangeKind.REBASED),
      droppedCount: plan.dropped.length,
      ...actor,
    } satisfies Prisma.InputJsonObject;

    await Promise.all(
      recipientUserIds.map((userId) =>
        this.notifications.createForUser(
          userId,
          NotificationType.REVIEW_NEW_VERSION,
          payload,
        ),
      ),
    );
  }

  async notifyCommitsReviewed(
    review: ReviewWithRelations,
    commitTitles: string[],
    actorUserId: string,
  ): Promise<void> {
    if (review.ownerId === actorUserId || commitTitles.length === 0) {
      return;
    }

    const actor = await this.actorPayload(actorUserId);
    const payload = {
      ...this.reviewPayload(review),
      commitCount: commitTitles.length,
      commitTitles: commitTitles.join("\n"),
      ...actor,
    } satisfies Prisma.InputJsonObject;

    await this.notifications.createForUser(
      review.ownerId,
      NotificationType.COMMIT_REVIEWED,
      payload,
    );
  }

  /**
   * Notifies the users a message mentions, bringing those who are not on the
   * review yet in as reviewers. On an edit, users the previous text already
   * mentioned were handled back then and are left alone. Returns who was
   * notified.
   */
  async notifyMentionedUsers(
    review: ReviewWithRelations,
    comment: CommentLocation,
    message: string,
    previousMessage: string | null,
    actorUserId: string,
  ): Promise<string[]> {
    const recipientIds = await this.newlyMentionedUserIds(
      message,
      previousMessage,
      actorUserId,
    );
    if (recipientIds.length === 0) {
      return [];
    }

    const addedReviewerIds = await this.addMentionedAsReviewers(
      review,
      recipientIds,
    );
    const payload = await this.commentPayload(
      review,
      comment,
      message,
      actorUserId,
    );

    await Promise.all(
      recipientIds.map((userId) =>
        this.notifications.createForUser(
          userId,
          NotificationType.COMMENT_MENTION,
          { ...payload, addedAsReviewer: addedReviewerIds.has(userId) },
        ),
      ),
    );

    return recipientIds;
  }

  /** Mentioned users that exist, minus the actor and earlier mentions. */
  private async newlyMentionedUserIds(
    message: string,
    previousMessage: string | null,
    actorUserId: string,
  ): Promise<string[]> {
    const alreadyMentionedIds = new Set(
      previousMessage === null ? [] : mentionedUserIds(previousMessage),
    );
    const candidateIds = mentionedUserIds(message).filter(
      (userId) => userId !== actorUserId && !alreadyMentionedIds.has(userId),
    );
    if (candidateIds.length === 0) {
      return [];
    }

    // An id matching no user stays plain text: nobody to notify.
    const existingUsers = await this.prisma.user.findMany({
      where: { id: { in: candidateIds } },
      select: { id: true },
    });
    const existingIds = new Set(existingUsers.map((user) => user.id));
    return candidateIds.filter((userId) => existingIds.has(userId));
  }

  private async addMentionedAsReviewers(
    review: ReviewWithRelations,
    recipientIds: string[],
  ): Promise<Set<string>> {
    const reviewerIds = new Set(
      review.reviewers.map((reviewer) => reviewer.userId),
    );
    const addedReviewerIds = new Set(
      recipientIds.filter(
        (userId) => userId !== review.ownerId && !reviewerIds.has(userId),
      ),
    );
    if (addedReviewerIds.size > 0) {
      await this.prisma.reviewReviewer.createMany({
        data: [...addedReviewerIds].map((userId) => ({
          reviewId: review.id,
          userId,
        })),
        skipDuplicates: true,
      });
    }
    return addedReviewerIds;
  }

  /** The owner is spared this one when the message mentions them already. */
  async notifyCommentReceived(
    review: ReviewWithRelations,
    comment: CommentLocation,
    message: string,
    actorUserId: string,
    mentionedRecipientIds: string[],
  ): Promise<void> {
    if (
      review.ownerId === actorUserId ||
      mentionedRecipientIds.includes(review.ownerId)
    ) {
      return;
    }

    const payload = await this.commentPayload(
      review,
      comment,
      message,
      actorUserId,
    );

    await this.notifications.createForUser(
      review.ownerId,
      NotificationType.COMMENT_RECEIVED,
      payload,
    );
  }

  async notifyReviewStatusChanged(
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

    const actor = await this.actorPayload(actorUserId);
    const payload = {
      ...this.reviewPayload(review),
      previousStatus,
      nextStatus,
      ...actor,
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

  /** The fields every review notification carries. */
  private reviewPayload(review: ReviewWithRelations) {
    return {
      reviewId: review.id,
      title: review.title,
      gitwebUrl: review.gitwebUrl,
      ownerEmail: review.owner.email,
      sourceProject: review.sourceProject,
      sourceBranch: review.sourceBranch,
      sourceCommit: review.sourceCommit,
      gitwebTitle: review.gitwebTitle,
    } satisfies Prisma.InputJsonObject;
  }

  private async actorPayload(actorUserId: string) {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: userSummarySelect,
    });
    return {
      actorEmail: actor?.email ?? null,
      actorNickname: actor?.settings?.nickname ?? null,
    } satisfies Prisma.InputJsonObject;
  }

  private async commentPayload(
    review: ReviewWithRelations,
    comment: CommentLocation,
    message: string,
    actorUserId: string,
  ) {
    const actor = await this.actorPayload(actorUserId);
    return {
      ...this.reviewPayload(review),
      commitHash: comment.commitHash,
      filePath: comment.filePath,
      lineNumber: comment.lineNumber,
      commentExcerpt: await this.commentExcerpt(message),
      ...actor,
    } satisfies Prisma.InputJsonObject;
  }

  /** A message as notifications quote it: mentions named, then cut short. */
  private async commentExcerpt(message: string): Promise<string> {
    const mentionedUsers = await mentionedUsersById(this.prisma, [message]);
    const text = replaceMentions(
      message,
      new Map(
        [...mentionedUsers].map(([userId, mentionedUser]) => [
          userId,
          mentionedUser.settings?.nickname ||
            mentionedUser.hostname ||
            mentionedUser.email,
        ]),
      ),
    );
    return text.length > 300 ? `${text.slice(0, 300)}...` : text;
  }
}
