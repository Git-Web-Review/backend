import type { Prisma } from "@prisma/client";

/**
 * The bare repository name reviews store as their project: no "<user>/"
 * namespace, no ".git" suffix. Forks of a repository therefore share their
 * default reviewers, and an admin can type the name in any of these forms.
 */
export function normalizeProjectName(value: string | null | undefined): string {
  const lastSegment = value?.trim().replace(/\/+$/, "").split("/").pop() ?? "";
  return lastSegment.replace(/\.git$/, "");
}

/**
 * Matches the reviews of any of `projects` (bare names). Reviews keep the
 * project as the gitweb URL gave it, so the stored value may still carry a
 * namespace or a ".git" suffix around the bare name.
 */
export function sourceProjectWhere(
  projects: string[],
): Prisma.ReviewWhereInput {
  return {
    OR: projects.flatMap((project) =>
      [project, `${project}.git`].flatMap((name) => [
        { sourceProject: name },
        { sourceProject: { endsWith: `/${name}` } },
      ]),
    ),
  };
}
