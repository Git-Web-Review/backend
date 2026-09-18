import { ReviewDiffResponseDto } from "../dto/review-diff-file-response.dto";
import { extractReviewerEmails } from "./commit-message";
import { parseGitPatch } from "./git-diff";
import { ensureGitCache, gitPatchId, runGit, runGitPiped } from "./git-runner";

export type GitCommitOption = {
  hash: string;
  title: string;
  authorName: string;
  authorEmail: string;
  authoredAt: string | null;
};

export type GitCommitMetadata = {
  hash: string;
  title: string;
  body: string;
  message: string;
  authorName: string;
  authorEmail: string;
  gitDiff: ReviewDiffResponseDto;
};

export async function fetchGitCommitMetadata(
  remoteUrl: string,
  commitHash: string,
): Promise<GitCommitMetadata> {
  const repoPath = await ensureGitCache(remoteUrl);

  await runGit(["-C", repoPath, "fetch", "--depth=2", remoteUrl, commitHash]);

  const commitOutput = await runGit([
    "-C",
    repoPath,
    "show",
    "-s",
    "--format=%H%x00%an%x00%ae%x00%s%x00%b",
    "FETCH_HEAD",
  ]);
  const [hash, authorName, authorEmail, title, body = ""] =
    commitOutput.split("\0");
  const patch = await runGit([
    "-C",
    repoPath,
    "show",
    "--format=",
    "--full-index",
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
    gitDiff: { files: parseGitPatch(patch) },
  };
}

export async function fetchGitBranchCommitOptions(
  remoteUrl: string,
  branch: string,
): Promise<{ options: GitCommitOption[]; reviewerEmails: string[] }> {
  const repoPath = await ensureGitCache(remoteUrl);

  await runGit([
    "-C",
    repoPath,
    "fetch",
    "--depth=50",
    remoteUrl,
    `+${branch}:refs/gwr/head`,
  ]);

  let upstreamRef: string | null = "refs/gwr/origin";
  try {
    await runGit([
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

  const logOutput = await runGit([
    "-C",
    repoPath,
    "log",
    "--max-count=50",
    "--format=%H%x00%an%x00%ae%x00%aI%x00%s%x00%b%x1e",
    upstreamRef ? `${upstreamRef}..refs/gwr/head` : "refs/gwr/head",
  ]);

  return parseBranchLog(logOutput);
}

function parseBranchLog(logOutput: string): {
  options: GitCommitOption[];
  reviewerEmails: string[];
} {
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
    for (const email of extractReviewerEmails(body)) {
      reviewerEmails.add(email);
    }
  }

  return { options, reviewerEmails: [...reviewerEmails] };
}

/**
 * The commit options matching a selection of (possibly abbreviated) hashes,
 * or every option when nothing is selected.
 */
export function selectCommitOptions<T extends { hash: string }>(
  options: T[],
  selectedHashes?: string[],
): T[] {
  const normalizedSelection = selectedHashes?.map((hash) =>
    hash.toLowerCase(),
  );
  return normalizedSelection?.length
    ? options.filter((option) =>
        normalizedSelection.some((hash) =>
          option.hash.toLowerCase().startsWith(hash),
        ),
      )
    : options;
}

export async function fetchBranchPatchIds(
  repoPath: string,
  hashes: string[],
): Promise<Map<string, string | null>> {
  // Pipeline recommandé par la doc git-patch-id : rev-list | diff-tree
  // --patch --stdin | patch-id, un seul appel par branche au lieu d'un
  // `git show` par commit.
  if (!hashes.length) {
    return new Map();
  }

  try {
    const revList = await runGit([
      "-C",
      repoPath,
      "rev-list",
      "--no-merges",
      ...hashes,
    ]);
    const output = await runGitPiped(
      ["-C", repoPath, "diff-tree", "--patch", "--stdin", "--no-color"],
      ["patch-id", "--stable"],
      revList,
    );
    const byHash = new Map<string, string | null>(
      hashes.map((hash) => [hash, null]),
    );
    const tokens = output.trim().split(/\s+/).filter(Boolean);
    for (let index = 0; index + 1 < tokens.length; index += 2) {
      const patchId = tokens[index];
      const commitHash = tokens[index + 1];
      if (patchId && commitHash && byHash.has(commitHash)) {
        byHash.set(commitHash, patchId);
      }
    }
    return byHash;
  } catch {
    return new Map(hashes.map((hash) => [hash, null]));
  }
}

export function patchIdFromGitDiff(
  gitDiff: ReviewDiffResponseDto,
): Promise<string | null> {
  return gitPatchId(gitDiff.files.map((file) => file.patch).join("\n"));
}
