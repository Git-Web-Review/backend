/**
 * The refs a branch is compared to, the first the remote has wins:
 * origin/master, else origin/HEAD for a repository without master.
 */
export const UPSTREAM_REFS = [
  "refs/remotes/origin/master",
  "refs/remotes/origin/HEAD",
];

/** The branch `git ls-remote --symref <remote> HEAD` says HEAD points at. */
export function defaultBranchFromSymref(output: string): string | null {
  return /^ref: refs\/heads\/(\S+)\tHEAD$/m.exec(output)?.[1] ?? null;
}
