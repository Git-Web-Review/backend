import { truncate } from "../review-text";

/** Per commit message: past this it is not a reviewer list any more. */
export const MAX_REVIEWER_EMAILS_PER_COMMIT = 20;

/** Deliberately permissive: it rejects nonsense, not unusual addresses. */
export function isPlausibleEmail(value: string): boolean {
  return (
    value.length <= 254 &&
    /^[^\s@<>,;"']+@[^\s@<>,;"'.]+(?:\.[^\s@<>,;"'.]+)+$/.test(value)
  );
}

export function descriptionFromGitBody(body: string): string | null {
  const descriptionLines: string[] = [];

  for (const line of body.replace(/\r/g, "").split("\n")) {
    const trimmedLine = line.trim();
    if (descriptionLines.length === 0 && trimmedLine === "") {
      continue;
    }
    if (isGitTrailerOrReference(trimmedLine)) {
      break;
    }
    descriptionLines.push(line);
  }

  while (descriptionLines.at(-1)?.trim() === "") {
    descriptionLines.pop();
  }

  return truncate(descriptionLines.join("\n"), 4000);
}

function isGitTrailerOrReference(line: string): boolean {
  return /^(?:Fixes|Signed-off-by|Acked-by|Reviewed-by|Tested-by|Cc|To):\s+/i.test(
    line,
  );
}

export function signedOffByFromLog(log?: string | null) {
  const signedOffBy = log?.match(/Signed-off-by:\s*([^<\n]+?)\s*<([^>\n]+)>/i);
  const author = log?.match(/Author:\s*([^<\n]+?)\s*<([^>\n]+)>/i);
  const match = signedOffBy ?? author;

  return {
    name: match?.[1]?.trim() ?? "unknown",
    email: match?.[2]?.trim() ?? "",
  };
}

/**
 * The addresses in the trailers of a commit message, which comes from a
 * repository the caller chose. Each one creates a `User` row if it does not
 * exist, so the count is capped and the format checked: a 20,000-character
 * message could otherwise create hundreds of accounts in one request, from
 * addresses that were not addresses.
 */
export function extractReviewerEmails(text?: string | null): string[] {
  if (!text) {
    return [];
  }

  const reviewerEmails = new Set<string>();
  const trailerRegex =
    /^(?:Reviewer|Reviewers|Reviewed-by|Acked-by|Tested-by|Cc|To):\s*[^<\n]*<([^>\n]+)>/gim;

  for (const match of text.matchAll(trailerRegex)) {
    const email = match[1].trim().toLowerCase();
    if (isPlausibleEmail(email)) {
      reviewerEmails.add(email);
    }

    if (reviewerEmails.size >= MAX_REVIEWER_EMAILS_PER_COMMIT) {
      break;
    }
  }

  return [...reviewerEmails];
}
