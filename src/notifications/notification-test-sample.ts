/**
 * The made-up notification a format test sends: every field a format or a
 * template can print is set. Same values as the frontend's live preview
 * (frontend/src/components/user-settings/notification-format.ts), so what the
 * user receives is what they saw. No `reviewId`: the link would point to a
 * review that does not exist, the relays fall back to `gitwebUrl`.
 */
export const NOTIFICATION_TEST_PAYLOAD = {
  title: "Fix login redirect",
  gitwebUrl: "https://git.company.tld/?p=auth.git;a=commit;h=3f2a9c1",
  actorNickname: "alice",
  ownerEmail: "bob@company.tld",
  message: "Please have a look before Friday",
  commentExcerpt: "Should this redirect keep the query string?",
  filePath: "src/login.ts",
  lineNumber: 128,
  previousStatus: "IN_REVIEW",
  nextStatus: "ACKED",
  sourceProject: "auth",
  sourceBranch: "fix/login-redirect",
  sourceCommit: "3f2a9c1",
  version: 3,
  newCount: 1,
  modifiedCount: 1,
  commitCount: 2,
  commitTitles: ["fix: keep the redirect target", "test: cover the redirect"],
  commitHash: "3f2a9c1",
  commitTitle: "fix: keep the redirect target",
  done: true,
  acked: true,
};
