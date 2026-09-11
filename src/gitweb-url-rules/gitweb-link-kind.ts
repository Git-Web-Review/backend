/**
 * What a git-web link resolves to once the URL rules have been applied: one
 * commit, or a branch summary covering several. Narrower than the
 * `GitwebUrlRuleKind` a rule is configured with, which also accepts `AUTO` and
 * lets the parser decide.
 */
export type GitwebLinkKind = "COMMIT" | "SUMMARY";

/** The same values as a runtime array, for `@ApiProperty({ enum })`. */
export const GITWEB_LINK_KINDS: GitwebLinkKind[] = ["COMMIT", "SUMMARY"];
