export function truncate(
  value: string | null | undefined,
  maxLength: number,
): string | null {
  if (!value) {
    return null;
  }

  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

export function nullIfBlank(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function firstMatch(value: string, regex: RegExp): string | null;
export function firstMatch(
  value: string | null | undefined,
  regex: RegExp,
): string | null;
export function firstMatch(
  value: string | null | undefined,
  regex: RegExp,
): string | null {
  return value?.match(regex)?.[1]?.trim() ?? null;
}

export function firstNonEmptyLine(value?: string | null): string | null {
  return (
    value
      ?.split("\n")
      .map((line) => line.trim())
      .find(Boolean) ?? null
  );
}

/**
 * Titre d'une review dérivé de sa série : nom de la branche si elle n'est
 * pas master, sinon titre du commit le plus ancien.
 */
export function reviewTitleFromCommits(
  branch: string | null,
  commitTitles: string[],
): string | null {
  if (branch && branch !== "master") {
    return branch;
  }

  return commitTitles[0] ?? null;
}
