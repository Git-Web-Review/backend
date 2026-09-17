import { Prisma, ReviewCommentSide } from "@prisma/client";
import { ReviewDiffResponseDto } from "../dto/review-diff-file-response.dto";
import { truncate } from "../review-text";

type DiffFile = ReviewDiffResponseDto["files"][number];

type DiffCommentRow = {
  text: string;
  lineNumber: number;
  side: ReviewCommentSide;
};

export function parseGitPatch(patch: string): DiffFile[] {
  const sections = patch
    .split(/(?=^diff --git )/gm)
    .map((section) => section.trimEnd())
    .filter(Boolean);

  return sections.map(parseGitPatchSection);
}

function parseGitPatchSection(section: string): DiffFile {
  const lines = section.split("\n");
  const headerMatch = lines[0].match(/^diff --git a\/(.+) b\/(.+)$/);
  let path = headerMatch?.[2] ?? "unknown";
  let oldPath: string | null = null;
  let status = "MODIFIED";
  let additions = 0;
  let deletions = 0;

  for (const line of lines) {
    if (line === "new file mode 100644") {
      status = "ADDED";
    } else if (line.startsWith("deleted file mode")) {
      status = "DELETED";
    } else if (line.startsWith("rename from ")) {
      oldPath = line.slice("rename from ".length);
      status = "RENAMED";
    } else if (line.startsWith("rename to ")) {
      path = line.slice("rename to ".length);
      status = "RENAMED";
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      additions += 1;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      deletions += 1;
    }
  }

  return {
    path,
    oldPath,
    status,
    additions,
    deletions,
    patch: truncate(section, 200000) ?? "",
  };
}

export function gitDiffFromSnapshot(
  snapshot: Prisma.JsonValue | null,
): ReviewDiffResponseDto {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return { files: [] };
  }

  return gitDiffFromJson(
    (snapshot as Record<string, unknown>).gitDiff as Prisma.JsonValue,
  );
}

export function gitDiffFromJson(
  gitDiff: Prisma.JsonValue | null,
): ReviewDiffResponseDto {
  if (!gitDiff || typeof gitDiff !== "object" || Array.isArray(gitDiff)) {
    return { files: [] };
  }

  const files = (gitDiff as Record<string, unknown>).files;
  if (!Array.isArray(files)) {
    return { files: [] };
  }

  return { files: files.filter(isReviewDiffFile) };
}

function isReviewDiffFile(file: unknown): file is DiffFile {
  if (!file || typeof file !== "object" || Array.isArray(file)) {
    return false;
  }
  const value = file as Record<string, unknown>;
  return (
    typeof value.path === "string" &&
    (typeof value.oldPath === "string" || value.oldPath === null) &&
    typeof value.status === "string" &&
    typeof value.additions === "number" &&
    typeof value.deletions === "number" &&
    typeof value.patch === "string"
  );
}

function diffCommentRows(patch: string): DiffCommentRow[] {
  const rows: DiffCommentRow[] = [];
  let oldLine = 0;
  let newLine = 0;
  let insideHunk = false;

  for (const line of patch.split("\n")) {
    const hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      insideHunk = true;
      continue;
    }
    if (!insideHunk) {
      continue;
    }
    if (line.startsWith("+") && !line.startsWith("+++")) {
      rows.push({ text: line, lineNumber: newLine, side: ReviewCommentSide.AFTER });
      newLine += 1;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      rows.push({ text: line, lineNumber: oldLine, side: ReviewCommentSide.BEFORE });
      oldLine += 1;
    } else if (line.startsWith(" ")) {
      // Context lines are numbered on the new side, like the frontend.
      rows.push({ text: line, lineNumber: newLine, side: ReviewCommentSide.AFTER });
      oldLine += 1;
      newLine += 1;
    }
  }

  return rows;
}

/**
 * Where a line comment lands in a new version of the diff: the row with the
 * same content on the same side, closest to where it was. Null when the line
 * is gone.
 */
export function remapCommentTarget(
  oldDiff: ReviewDiffResponseDto,
  newDiff: ReviewDiffResponseDto,
  comment: { filePath: string; lineNumber: number; side: ReviewCommentSide },
): { filePath: string; lineNumber: number } | null {
  const oldFile = oldDiff.files.find((file) => file.path === comment.filePath);
  const newFile = newDiff.files.find(
    (file) =>
      file.path === comment.filePath || file.oldPath === comment.filePath,
  );
  if (!oldFile || !newFile) {
    return null;
  }

  const oldRow = diffCommentRows(oldFile.patch).find(
    (row) => row.lineNumber === comment.lineNumber && row.side === comment.side,
  );
  if (!oldRow) {
    return null;
  }

  const candidates = diffCommentRows(newFile.patch).filter(
    (row) => row.side === comment.side && row.text === oldRow.text,
  );
  if (candidates.length === 0) {
    return null;
  }

  const closest = candidates.reduce((best, row) =>
    Math.abs(row.lineNumber - comment.lineNumber) <
    Math.abs(best.lineNumber - comment.lineNumber)
      ? row
      : best,
  );
  return { filePath: newFile.path, lineNumber: closest.lineNumber };
}
