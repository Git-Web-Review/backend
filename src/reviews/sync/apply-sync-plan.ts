import {
  Prisma,
  ReviewCommitChangeKind,
  ReviewCommitStatus,
} from "@prisma/client";
import { commitCreateFromGitMetadata } from "../gitweb/gitweb-metadata";
import type { ReviewWithRelations } from "../review-queries";
import { truncate } from "../review-text";
import {
  allCommitsStayAcked,
  modifiedEntries,
  syncedReviewText,
  type SyncPlan,
  type SyncPlanEntry,
} from "./sync-plan";

/** Where a line comment moves to; a null line means the line is gone. */
export type CommentRemap = {
  commentId: string;
  filePath: string;
  lineNumber: number | null;
};

/** Writes a sync plan as the next version of the review, in one transaction. */
export async function applySyncPlan(
  tx: Prisma.TransactionClient,
  review: ReviewWithRelations,
  plan: SyncPlan,
  commentRemaps: CommentRemap[],
  actorId: string,
): Promise<void> {
  const reviewId = review.id;
  await removeDroppedCommits(tx, reviewId, plan);

  const rehashedEntries = plan.entries.filter(
    (entry) => entry.previous && entry.previous.hash !== entry.hash,
  );
  await parkRehashedCommits(tx, reviewId, rehashedEntries);
  await writePlanEntries(tx, reviewId, plan.entries);
  await restoreRehashedComments(tx, reviewId, rehashedEntries);
  await applyCommentRemaps(tx, commentRemaps, actorId);
  await resetModifiedCommits(tx, plan);

  if (!allCommitsStayAcked(plan)) {
    await tx.reviewReviewer.updateMany({
      where: { reviewId },
      data: { acknowledgedAt: null },
    });
  }

  const text = syncedReviewText(plan, review.title);
  await tx.review.update({
    where: { id: reviewId },
    data: {
      version: review.version + 1,
      sourceBranch: plan.branch,
      sourceCommit: plan.entries.at(-1)?.hash ?? review.sourceCommit,
      title: text.title,
      description: truncate(text.description, 4000),
      gitwebLog: text.log,
      gitwebFetchedAt: new Date(),
      gitwebFetchError: null,
    },
  });
}

/** Comments on a dropped commit stay on the review, without a commit. */
async function removeDroppedCommits(
  tx: Prisma.TransactionClient,
  reviewId: string,
  plan: SyncPlan,
): Promise<void> {
  for (const dropped of plan.dropped) {
    await tx.reviewComment.updateMany({
      where: { reviewId, commitHash: dropped.hash },
      data: { commitHash: null },
    });
  }
  if (plan.dropped.length) {
    await tx.reviewCommit.deleteMany({
      where: { id: { in: plan.dropped.map((commit) => commit.id) } },
    });
  }
}

/**
 * First phase of a two-phase hash swap, to avoid transient collisions on the
 * (reviewId, hash) unique constraint when hashes are chained.
 */
async function parkRehashedCommits(
  tx: Prisma.TransactionClient,
  reviewId: string,
  rehashedEntries: SyncPlanEntry[],
): Promise<void> {
  for (const entry of rehashedEntries) {
    await tx.reviewCommit.update({
      where: { id: entry.previous!.id },
      data: { hash: `sync:${entry.previous!.id}` },
    });
    await tx.reviewComment.updateMany({
      where: { reviewId, commitHash: entry.previous!.hash },
      data: { commitHash: `sync:${entry.previous!.id}` },
    });
  }
}

async function writePlanEntries(
  tx: Prisma.TransactionClient,
  reviewId: string,
  entries: SyncPlanEntry[],
): Promise<void> {
  for (const entry of entries) {
    if (!entry.previous) {
      await tx.reviewCommit.create({
        data: {
          reviewId,
          ...commitCreateFromGitMetadata(entry.metadata!, entry.position),
          patchId: entry.patchId,
          changeKind: ReviewCommitChangeKind.NEW,
        },
      });
      continue;
    }

    const contentUpdate = entry.metadata
      ? {
          ...commitCreateFromGitMetadata(entry.metadata, entry.position),
          patchId: entry.patchId,
        }
      : { position: entry.position };

    await tx.reviewCommit.update({
      where: { id: entry.previous.id },
      data: {
        ...contentUpdate,
        hash: entry.hash,
        changeKind: entry.changeKind,
        ...(entry.changeKind === ReviewCommitChangeKind.MODIFIED
          ? { status: ReviewCommitStatus.PENDING }
          : {}),
      },
    });
  }
}

/** Second phase of the hash swap: comments follow their commit. */
async function restoreRehashedComments(
  tx: Prisma.TransactionClient,
  reviewId: string,
  rehashedEntries: SyncPlanEntry[],
): Promise<void> {
  for (const entry of rehashedEntries) {
    await tx.reviewComment.updateMany({
      where: { reviewId, commitHash: `sync:${entry.previous!.id}` },
      data: { commitHash: entry.hash },
    });
  }
}

/**
 * A comment whose line no longer exists in the new diff is closed; otherwise
 * it follows its line content to the new location.
 */
async function applyCommentRemaps(
  tx: Prisma.TransactionClient,
  commentRemaps: CommentRemap[],
  actorId: string,
): Promise<void> {
  for (const remap of commentRemaps) {
    await tx.reviewComment.update({
      where: { id: remap.commentId },
      data:
        remap.lineNumber === null
          ? { done: true, doneById: actorId, doneAt: new Date() }
          : { filePath: remap.filePath, lineNumber: remap.lineNumber },
    });
  }
}

/** A modified commit loses its acks and the files marked as viewed. */
async function resetModifiedCommits(
  tx: Prisma.TransactionClient,
  plan: SyncPlan,
): Promise<void> {
  const modified = modifiedEntries(plan);

  const modifiedWithAcks = modified.filter(
    (entry) => entry.previous!.acks.length > 0,
  );
  if (modifiedWithAcks.length) {
    await tx.reviewCommitAck.deleteMany({
      where: {
        reviewCommitId: {
          in: modifiedWithAcks.map((entry) => entry.previous!.id),
        },
      },
    });
  }

  const modifiedCommitIds = modified.map((entry) => entry.previous!.id);
  if (modifiedCommitIds.length) {
    await tx.reviewFileView.deleteMany({
      where: { reviewCommitId: { in: modifiedCommitIds } },
    });
  }
}
