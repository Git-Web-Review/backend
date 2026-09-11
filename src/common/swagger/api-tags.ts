/**
 * Every tag the OpenAPI document groups operations under. Declared once so a
 * controller cannot invent a typo'd tag that would show up as an extra,
 * undocumented section in the spec.
 */
export const ApiTag = {
  Auth: "auth",
  Health: "health",
  Users: "users",
  Reviews: "reviews",
  ReviewFields: "review-fields",
  Notifications: "notifications",
  GitwebUrlRules: "gitweb-url-rules",
  CommitLogLinkRules: "commit-log-link-rules",
  Settings: "settings",
  Admin: "admin",
} as const;

export type ApiTagName = (typeof ApiTag)[keyof typeof ApiTag];

/**
 * Tag descriptions rendered at the top of each Swagger UI section. Keeping them
 * next to the tag names means a new tag cannot be added without explaining what
 * it covers.
 */
export const API_TAG_DESCRIPTIONS: Record<ApiTagName, string> = {
  [ApiTag.Auth]:
    "Obtaining an access token. Humans sign in through Firebase; agents and CI exchange service account credentials here.",
  [ApiTag.Health]: "Unauthenticated liveness probe.",
  [ApiTag.Users]:
    "The caller's own profile, settings and avatar, plus read-only access to other users' avatars.",
  [ApiTag.Reviews]:
    "The core resource: reviews created from a git-web link, their commits, diffs, comments and acknowledgements.",
  [ApiTag.ReviewFields]:
    "Admin-defined custom fields (ticket link, release, ...) that every review can carry.",
  [ApiTag.Notifications]:
    "The caller's notification inbox and its seen state.",
  [ApiTag.GitwebUrlRules]:
    "Admin-defined rules that turn a git-web URL into the repository coordinates the backend clones.",
  [ApiTag.CommitLogLinkRules]:
    "Admin-defined rules that turn patterns found in commit messages into clickable links.",
  [ApiTag.Settings]:
    "Instance-wide settings and branding. Admins write them; every signed-in user reads the branding.",
  [ApiTag.Admin]:
    "Instance administration: users, admin grants, service accounts and broadcast notifications.",
};
