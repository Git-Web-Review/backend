import { PrismaService } from "../../prisma/prisma.service";
import { gitDiffFromJson } from "../git/git-diff";
import { patchIdFromGitDiff } from "../git/git-remote";
import type { ReviewCommitWithAcks } from "../review-queries";

/** Patch-id of each commit by id, computed and stored when missing. */
export async function ensureCommitPatchIds(
  prisma: PrismaService,
  commits: ReviewCommitWithAcks[],
): Promise<Map<string, string | null>> {
  const patchIds = new Map<string, string | null>();
  for (const commit of commits) {
    if (commit.patchId) {
      patchIds.set(commit.id, commit.patchId);
      continue;
    }

    const patchId = await patchIdFromGitDiff(gitDiffFromJson(commit.gitDiff));
    patchIds.set(commit.id, patchId);
    if (patchId) {
      await prisma.reviewCommit.update({
        where: { id: commit.id },
        data: { patchId },
      });
    }
  }
  return patchIds;
}
