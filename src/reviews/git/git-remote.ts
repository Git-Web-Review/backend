import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ReviewDiffResponseDto } from "../dto/review-diff-file-response.dto";
import { extractReviewerEmails } from "./commit-message";
import { parseGitPatch } from "./git-diff";
import { defaultBranchFromSymref, UPSTREAM_REFS } from "./remote-refs";
import { ensureGitCache, gitPatchId, runGit, runGitPiped } from "./git-runner";

/** How far back a branch is fetched, and so how many commits it can list. */
const BRANCH_HISTORY_DEPTH = 50;

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

/**
 * The branch the remote's HEAD points at, for a link that names none; master
 * when the remote does not say.
 */
export async function remoteDefaultBranch(remoteUrl: string): Promise<string> {
  try {
    const output = await runGit(["ls-remote", "--symref", remoteUrl, "HEAD"]);
    return defaultBranchFromSymref(output) ?? "master";
  } catch {
    return "master";
  }
}

/**
 * Fetches the upstream a branch is compared to into `destination`; never the
 * branch itself, which has nothing ahead of itself.
 */
export async function fetchUpstream(
  repoPath: string,
  remoteUrl: string,
  depth: number,
  destination: string,
  branch?: string,
): Promise<boolean> {
  const candidates = UPSTREAM_REFS.filter(
    (ref) => ref !== `refs/heads/${branch}`,
  );
  for (const ref of candidates) {
    try {
      await runGit([
        "-C",
        repoPath,
        "fetch",
        `--depth=${depth}`,
        remoteUrl,
        `+${ref}:${destination}`,
      ]);
      return true;
    } catch {
      // Not on this remote: try the next one.
    }
  }
  return false;
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
    `--depth=${BRANCH_HISTORY_DEPTH}`,
    remoteUrl,
    `+${branch}:refs/gwr/head`,
  ]);

  const upstreamRef = (await fetchUpstream(
    repoPath,
    remoteUrl,
    BRANCH_HISTORY_DEPTH,
    "refs/gwr/origin",
    branch,
  ))
    ? "refs/gwr/origin"
    : null;
  const hasUpstream =
    (await fetchRemoteTrackingRefs(repoPath, remoteUrl)) ||
    upstreamRef !== null;

  const branchLog = (...revisions: string[]) =>
    runGit([
      "-C",
      repoPath,
      "log",
      `--max-count=${BRANCH_HISTORY_DEPTH}`,
      "--format=%H%x00%an%x00%ae%x00%aI%x00%s%x00%b%x1e",
      ...revisions,
    ]);

  // A branch is often cut from another upstream branch than master (a
  // maintenance branch): only its own commits, those on no upstream branch,
  // are to review.
  const ahead = parseBranchLog(
    await branchLog(
      "refs/gwr/head",
      "--not",
      ...(upstreamRef ? [upstreamRef] : []),
      "--glob=refs/gwr/upstream/*",
    ),
  );
  if (
    ahead.options.length > 0 ||
    !hasUpstream ||
    !(await isCompleteHistory(repoPath, "refs/gwr/head"))
  ) {
    return ahead;
  }

  // A new repository's first commits can only be pushed straight to master,
  // so nothing is ever ahead of origin/master. While the whole history still
  // fits in the fetch window, it is what there is to review.
  return parseBranchLog(await branchLog("refs/gwr/head"));
}

/**
 * Fetches the remote's remote-tracking branches (the upstream branches of a
 * developer repository) into refs/gwr/upstream/*.
 */
async function fetchRemoteTrackingRefs(
  repoPath: string,
  remoteUrl: string,
): Promise<boolean> {
  try {
    await runGit([
      "-C",
      repoPath,
      "fetch",
      "--prune",
      `--depth=${BRANCH_HISTORY_DEPTH}`,
      remoteUrl,
      "+refs/remotes/origin/*:refs/gwr/upstream/*",
    ]);
  } catch {
    return false;
  }
  const refs = await runGit([
    "-C",
    repoPath,
    "for-each-ref",
    "--count=1",
    "refs/gwr/upstream/",
  ]);
  return refs.trim() !== "";
}

/**
 * Whether every commit reachable from `ref` is in the cache: the shallow
 * fetches cut no parent away, so the history goes down to its root commits.
 */
async function isCompleteHistory(
  repoPath: string,
  ref: string,
): Promise<boolean> {
  const shallowCommits = new Set(
    (await readFile(join(repoPath, "shallow"), "utf8").catch(() => ""))
      .split(/\s+/)
      .filter(Boolean),
  );
  const history = (await runGit(["-C", repoPath, "rev-list", ref]))
    .split(/\s+/)
    .filter(Boolean);

  return (
    history.length < BRANCH_HISTORY_DEPTH &&
    !history.some((hash) => shallowCommits.has(hash))
  );
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
