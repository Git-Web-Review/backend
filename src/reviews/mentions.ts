/**
 * A mention is stored in a comment as `@<user id>`, so renaming a user never
 * breaks it; clients swap the id for the user's name when they display it.
 * The lookarounds keep an id glued to other text, like `foo@<id>`, out.
 */
const MENTION_PATTERN =
  /(?<![\p{L}\p{N}_@])@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?![\p{L}\p{N}_-])/giu;

/** Mentioned user ids, deduplicated, in order of first appearance. */
export function mentionedUserIds(message: string): string[] {
  return [
    ...new Set(
      Array.from(message.matchAll(MENTION_PATTERN), (match) =>
        match[1].toLowerCase(),
      ),
    ),
  ];
}

/** Replaces each mention whose user is known by `@<label>`. */
export function replaceMentions(
  message: string,
  labelsByUserId: Map<string, string>,
): string {
  return message.replace(MENTION_PATTERN, (mention, userId: string) => {
    const label = labelsByUserId.get(userId.toLowerCase());
    return label ? `@${label}` : mention;
  });
}
