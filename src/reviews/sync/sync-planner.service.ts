import { HttpStatus, Injectable } from "@nestjs/common";
import { ReviewCommitChangeKind } from "@prisma/client";
import { AppException } from "../../common/app.exception";
import { ErrorCode } from "../../common/error-code.enum";
import { PrismaService } from "../../prisma/prisma.service";
import {
  fetchGitBranchCommitOptions,
  fetchGitCommitMetadata,
  patchIdFromGitDiff,
  selectCommitOptions,
  type GitCommitOption,
} from "../git/git-remote";
import { GitwebMetadataService } from "../gitweb/gitweb-metadata.service";
import type { ReviewWithRelations } from "../review-queries";
import { ensureCommitPatchIds } from "./commit-patch-ids";
import { SyncBranchResolverService } from "./sync-branch-resolver.service";
import {
  matchAmendedCommits,
  matchLeftoverCommitsByOrder,
  matchRebasedCommits,
  planHasChanges,
  type RemainingCommits,
  type SyncPlan,
  type SyncPlanEntry,
} from "./sync-plan";

/** Pairs the commits on the branch with those of the current version. */
@Injectable()
export class SyncPlannerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gitwebMetadata: GitwebMetadataService,
    private readonly branchResolver: SyncBranchResolverService,
  ) {}

  async computeSyncPlan(
    review: ReviewWithRelations,
    selectedHashes?: string[],
  ): Promise<SyncPlan> {
    const metadata = await this.gitwebMetadata.metadataFromUrl(
      review.gitwebUrl,
    );
    if (!metadata.remoteUrl) {
      throw badRequest("This review has no source branch to synchronize from");
    }

    const branch = await this.branchResolver.resolveSyncBranch(
      review,
      metadata.remoteUrl,
      metadata.sourceBranchFromUrl ? metadata.sourceBranch : null,
    );
    if (!branch) {
      throw badRequest(
        "Could not find a remote branch containing the review commits",
      );
    }

    const { options } = await fetchGitBranchCommitOptions(
      metadata.remoteUrl,
      branch,
    );
    if (options.length === 0) {
      throw badRequest(
        `No commits to review on branch "${branch}": it has no commits ahead of origin/master`,
      );
    }

    const selected = selectCommitOptions(options, selectedHashes);
    if (selected.length === 0) {
      throw badRequest("No matching commits selected for the new version");
    }

    const oldPatchIds = await ensureCommitPatchIds(this.prisma, review.commits);
    const remainingOld: RemainingCommits = new Map(
      review.commits.map((commit) => [commit.id, commit]),
    );

    // Pass 1: same hash, the commit did not move.
    const entries = await this.entriesMatchedByHash(
      metadata.remoteUrl,
      [...selected].reverse(),
      remainingOld,
      oldPatchIds,
    );
    const unmatched = entries.filter((entry) => !entry.previous);

    matchRebasedCommits(unmatched, remainingOld, oldPatchIds);
    matchAmendedCommits(unmatched, remainingOld);
    matchLeftoverCommitsByOrder(unmatched, remainingOld);

    const dropped = [...remainingOld.values()];
    return {
      branch,
      entries,
      dropped,
      hasChanges: planHasChanges(entries, dropped),
    };
  }

  /**
   * One entry per selected commit, oldest first. Commits already in the
   * review are paired right away; the others are fetched as new.
   */
  private async entriesMatchedByHash(
    remoteUrl: string,
    orderedOldestFirst: GitCommitOption[],
    remainingOld: RemainingCommits,
    oldPatchIds: Map<string, string | null>,
  ): Promise<SyncPlanEntry[]> {
    const entries: SyncPlanEntry[] = [];
    for (const [position, option] of orderedOldestFirst.entries()) {
      const previousByHash = [...remainingOld.values()].find(
        (commit) => commit.hash === option.hash,
      );
      if (previousByHash) {
        remainingOld.delete(previousByHash.id);
        entries.push({
          hash: option.hash,
          title: option.title,
          authorName: option.authorName,
          authoredAt: option.authoredAt,
          position,
          changeKind: ReviewCommitChangeKind.UNCHANGED,
          previous: previousByHash,
          metadata: null,
          patchId: oldPatchIds.get(previousByHash.id) ?? null,
        });
        continue;
      }

      const commitMetadata = await fetchGitCommitMetadata(
        remoteUrl,
        option.hash,
      );
      entries.push({
        hash: commitMetadata.hash,
        title: commitMetadata.title,
        authorName: option.authorName,
        authoredAt: option.authoredAt,
        position,
        changeKind: ReviewCommitChangeKind.NEW,
        previous: null,
        metadata: commitMetadata,
        patchId: await patchIdFromGitDiff(commitMetadata.gitDiff),
      });
    }
    return entries;
  }
}

function badRequest(message: string): AppException {
  return new AppException(
    ErrorCode.UNKNOWN_ERROR,
    HttpStatus.BAD_REQUEST,
    message,
  );
}
