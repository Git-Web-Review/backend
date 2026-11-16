/**
 * A commit marked reviewed goes back to review when a message is posted on
 * it, so that a reviewer marks it reviewed again once the thread is handled.
 */
export function commitToReopen<
  T extends { hash: string; status: string; acks: unknown[] },
>(commits: T[], commitHash: string | null): T | undefined {
  if (!commitHash) {
    return undefined;
  }
  return commits.find(
    (commit) =>
      commit.hash === commitHash &&
      commit.status === "REVIEWED" &&
      commit.acks.length === 0,
  );
}
