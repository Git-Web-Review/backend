import {
  ReviewCommitChangeKind,
  ReviewCommitStatus,
} from "@prisma/client";
import type { GitCommitMetadata } from "../git/git-remote";
import { rawMessageFromGitMetadata } from "../gitweb/gitweb-metadata";
import type { ReviewCommitWithAcks } from "../review-queries";
import { reviewTitleFromCommits, truncate } from "../review-text";

export type SyncPlanEntry = {
  hash: string;
  title: string;
  authorName: string;
  authoredAt: string | null;
  position: number;
  changeKind: ReviewCommitChangeKind;
  previous: ReviewCommitWithAcks | null;
  metadata: GitCommitMetadata | null;
  patchId: string | null;
};

export type SyncPlan = {
  branch: string;
  entries: SyncPlanEntry[];
  dropped: ReviewCommitWithAcks[];
  hasChanges: boolean;
};

/** Old commits not paired with a new one yet, by id. */
export type RemainingCommits = Map<string, ReviewCommitWithAcks>;

/**
 * Identical patch-id means the diff is unchanged. Only a commit whose message
 * did not move either is a pure rebase, keeping its status and its acks; a
 * rewritten commit log is a change the reviewers have to look at again.
 */
export function matchRebasedCommits(
  unmatched: SyncPlanEntry[],
  remainingOld: RemainingCommits,
  oldPatchIds: Map<string, string | null>,
): void {
  for (const entry of unmatched) {
    if (!entry.patchId) {
      continue;
    }
    const match = [...remainingOld.values()].find(
      (commit) => oldPatchIds.get(commit.id) === entry.patchId,
    );
    if (match) {
      remainingOld.delete(match.id);
      entry.previous = match;
      entry.changeKind = logChanged(entry, match)
        ? ReviewCommitChangeKind.LOG_MODIFIED
        : ReviewCommitChangeKind.REBASED;
    }
  }
}

/** Compared as stored, so a truncated message does not read as a change. */
function logChanged(
  entry: SyncPlanEntry,
  previous: ReviewCommitWithAcks,
): boolean {
  return (
    !!entry.metadata &&
    rawMessageFromGitMetadata(entry.metadata) !== previous.rawMessage
  );
}

/** Same title on both sides (unique) means the commit was amended in place. */
export function matchAmendedCommits(
  unmatched: SyncPlanEntry[],
  remainingOld: RemainingCommits,
): void {
  for (const entry of unmatched) {
    if (entry.previous) {
      continue;
    }
    const titleMatches = [...remainingOld.values()].filter(
      (commit) => commit.title === entry.title,
    );
    const duplicateNew = unmatched.filter(
      (other) => !other.previous && other.title === entry.title,
    );
    if (titleMatches.length === 1 && duplicateNew.length === 1) {
      remainingOld.delete(titleMatches[0].id);
      entry.previous = titleMatches[0];
      entry.changeKind = ReviewCommitChangeKind.MODIFIED;
    }
  }
}

/** Pairs leftovers by order as a last resort. */
export function matchLeftoverCommitsByOrder(
  unmatched: SyncPlanEntry[],
  remainingOld: RemainingCommits,
): void {
  const leftoversNew = unmatched.filter((entry) => !entry.previous);
  const leftoversOld = [...remainingOld.values()].sort(
    (left, right) => left.position - right.position,
  );
  for (const [index, entry] of leftoversNew.entries()) {
    const candidate = leftoversOld[index];
    if (!candidate) {
      break;
    }
    remainingOld.delete(candidate.id);
    entry.previous = candidate;
    entry.changeKind = ReviewCommitChangeKind.MODIFIED;
  }
}

export function planHasChanges(
  entries: SyncPlanEntry[],
  dropped: ReviewCommitWithAcks[],
): boolean {
  return (
    dropped.length > 0 ||
    entries.some(
      (entry) =>
        entry.changeKind !== ReviewCommitChangeKind.UNCHANGED ||
        entry.previous?.position !== entry.position,
    )
  );
}

/** Title, log and description of the review once the plan is applied. */
export function syncedReviewText(plan: SyncPlan, currentTitle: string | null) {
  const title =
    reviewTitleFromCommits(
      plan.branch,
      [...plan.entries].reverse().map((entry) => entry.title),
    ) ?? currentTitle;
  const log = truncate(
    plan.entries
      .map((entry) => entry.title)
      .reverse()
      .join("\n"),
    20000,
  );
  const description =
    plan.entries.length > 1
      ? plan.entries.map((entry) => `- ${entry.title}`).join("\n")
      : log;

  return { title, log, description };
}

/** Reviewer acks survive only when every commit comes back acked as is. */
export function allCommitsStayAcked(plan: SyncPlan): boolean {
  return (
    plan.dropped.length === 0 &&
    plan.entries.every(
      (entry) =>
        (entry.changeKind === ReviewCommitChangeKind.UNCHANGED ||
          entry.changeKind === ReviewCommitChangeKind.REBASED) &&
        entry.previous?.status === ReviewCommitStatus.ACKED,
    )
  );
}

/** Entries whose commit changed content and has a previous version. */
export function modifiedEntries(plan: SyncPlan): SyncPlanEntry[] {
  return plan.entries.filter(
    (entry) =>
      entry.changeKind === ReviewCommitChangeKind.MODIFIED && entry.previous,
  );
}

/** A commit whose diff or whose log moved is up for review again. */
export function needsNewReview(entry: SyncPlanEntry): boolean {
  return (
    entry.changeKind === ReviewCommitChangeKind.MODIFIED ||
    entry.changeKind === ReviewCommitChangeKind.LOG_MODIFIED
  );
}
