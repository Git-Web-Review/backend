import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import {
  fetchBranchPatchIds,
  fetchGitBranchCommitOptions,
} from "../git/git-remote";
import { ensureGitCache, runGit } from "../git/git-runner";
import type { ReviewWithRelations } from "../review-queries";
import { ensureCommitPatchIds } from "./commit-patch-ids";

type RemoteHead = { hash: string; branch: string };

type OverlapScores = { patchIdScore: number; titleScore: number };

/** At most this many remote branches are scored against the review. */
const MAX_SCORED_BRANCHES = 25;

@Injectable()
export class SyncBranchResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves the branch to synchronize from. The branch named by the review
   * URL wins, then the stored branch shown on the review. Reviews created
   * from a commit link store a "master" fallback branch, which is only kept
   * when master actually carries the review commits; otherwise prefer the
   * remote branch whose tip currently is (or recently was) one of them.
   */
  async resolveSyncBranch(
    review: ReviewWithRelations,
    remoteUrl: string,
    urlBranch: string | null,
  ): Promise<string | null> {
    const reviewHashes = new Set(review.commits.map((commit) => commit.hash));
    if (review.sourceCommit) {
      reviewHashes.add(review.sourceCommit);
    }

    const refs = await listRemoteHeads(remoteUrl);
    const existsRemotely = (branch: string) =>
      refs.length === 0 || refs.some((ref) => ref.branch === branch);

    if (urlBranch && existsRemotely(urlBranch)) {
      return urlBranch;
    }

    const oldPatchIds = await ensureCommitPatchIds(this.prisma, review.commits);
    const reviewPatchIds = new Set(
      [...oldPatchIds.values()].filter((patchId): patchId is string =>
        Boolean(patchId),
      ),
    );
    const reviewTitles = new Set(review.commits.map((commit) => commit.title));
    const overlapScores = async (branch: string) => {
      try {
        return await branchOverlapScores(
          remoteUrl,
          branch,
          reviewHashes,
          reviewPatchIds,
          reviewTitles,
        );
      } catch {
        return null;
      }
    };

    // The stored branch is trustworthy when it still exists remotely, unless
    // it is the master fallback of a commit link that master does not carry.
    const storedBranch = review.sourceBranch;
    if (storedBranch && existsRemotely(storedBranch)) {
      if (storedBranch !== "master") {
        return storedBranch;
      }
      const scores = await overlapScores(storedBranch);
      if (scores && (scores.patchIdScore > 0 || scores.titleScore > 0)) {
        return storedBranch;
      }
    }

    // A branch tip is exactly one of the review commits.
    const tipMatch = refs.find((ref) => reviewHashes.has(ref.hash));
    if (tipMatch) {
      return tipMatch.branch;
    }

    return (await bestOverlappingBranch(refs, overlapScores)) ?? storedBranch;
  }
}

async function listRemoteHeads(remoteUrl: string): Promise<RemoteHead[]> {
  try {
    const lsRemote = await runGit(["ls-remote", "--heads", remoteUrl]);
    return lsRemote
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [hash, ref] = line.split(/\s+/);
        return {
          hash: hash ?? "",
          branch: (ref ?? "").replace(/^refs\/heads\//, ""),
        };
      })
      .filter((ref) => ref.hash && ref.branch);
  } catch {
    return [];
  }
}

/**
 * Last resort: the branch whose commits ahead of master best overlap the
 * review commits. Patch-id (content) outranks titles: successive versions of
 * the same series usually share commit titles, but only the current branch
 * still has identical patches.
 */
async function bestOverlappingBranch(
  refs: RemoteHead[],
  overlapScores: (branch: string) => Promise<OverlapScores | null>,
): Promise<string | null> {
  let bestBranch: string | null = null;
  let bestPatchIdScore = 0;
  let bestTitleScore = 0;
  const candidates = refs
    .filter((ref) => ref.branch !== "master")
    .slice(0, MAX_SCORED_BRANCHES);
  for (const ref of candidates) {
    const scores = await overlapScores(ref.branch);
    if (!scores) {
      continue;
    }
    const { patchIdScore, titleScore } = scores;
    if (
      patchIdScore > bestPatchIdScore ||
      (patchIdScore === bestPatchIdScore && titleScore > bestTitleScore)
    ) {
      bestPatchIdScore = patchIdScore;
      bestTitleScore = titleScore;
      bestBranch = ref.branch;
    }
  }
  return bestBranch;
}

/**
 * Counts the branch commits ahead of origin/master that match the review:
 * same hash or patch-id (content) first, else same title.
 */
async function branchOverlapScores(
  remoteUrl: string,
  branch: string,
  reviewHashes: Set<string>,
  reviewPatchIds: Set<string>,
  reviewTitles: Set<string>,
): Promise<OverlapScores> {
  const { options } = await fetchGitBranchCommitOptions(remoteUrl, branch);
  const missing = options.filter((option) => !reviewHashes.has(option.hash));
  let patchIdScore = options.length - missing.length;
  let titleScore = 0;
  if (missing.length && reviewPatchIds.size) {
    const branchPatchIds = await fetchBranchPatchIds(
      await ensureGitCache(remoteUrl),
      missing.map((option) => option.hash),
    );
    for (const option of missing) {
      const patchId = branchPatchIds.get(option.hash);
      if (patchId && reviewPatchIds.has(patchId)) {
        patchIdScore += 1;
      } else if (reviewTitles.has(option.title)) {
        titleScore += 1;
      }
    }
  }
  return { patchIdScore, titleScore };
}
