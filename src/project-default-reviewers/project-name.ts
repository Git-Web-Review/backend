/**
 * The bare repository name reviews store as their project: no "<user>/"
 * namespace, no ".git" suffix. Forks of a repository therefore share their
 * default reviewers, and an admin can type the name in any of these forms.
 */
export function normalizeProjectName(value: string | null | undefined): string {
  const lastSegment = value?.trim().replace(/\/+$/, "").split("/").pop() ?? "";
  return lastSegment.replace(/\.git$/, "");
}
