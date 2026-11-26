/**
 * The refs a branch is compared to, the first the remote has wins:
 * origin/master, else origin/HEAD for a repository without master, else
 * the remote's own master for a repository that keeps no remote-tracking refs.
 */
export const UPSTREAM_REFS = [
  "refs/remotes/origin/master",
  "refs/remotes/origin/HEAD",
  "refs/heads/master",
];

/** The branch `git ls-remote --symref <remote> HEAD` says HEAD points at. */
export function defaultBranchFromSymref(output: string): string | null {
  return /^ref: refs\/heads\/(\S+)\tHEAD$/m.exec(output)?.[1] ?? null;
}
