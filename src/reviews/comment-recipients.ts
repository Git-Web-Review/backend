export type RecipientRole = "owner" | "reviewer" | "participant";

/**
 * Who hears about something happening on a review, and in which role: the
 * owner, then the reviewers, then anyone else who wrote in the thread. One
 * entry per user, the first role wins. The actor never hears about their own
 * action, and the excluded users (those a message mentions, who get
 * COMMENT_MENTION instead) are left out.
 */
export function reviewRecipients(input: {
  ownerId: string;
  reviewerIds: string[];
  threadAuthorIds?: string[];
  actorId: string;
  excludedIds?: string[];
}): Map<string, RecipientRole> {
  const skipped = new Set([input.actorId, ...(input.excludedIds ?? [])]);
  const recipients = new Map<string, RecipientRole>();
  const add = (userIds: string[], role: RecipientRole) => {
    for (const userId of userIds) {
      if (!skipped.has(userId) && !recipients.has(userId)) {
        recipients.set(userId, role);
      }
    }
  };

  add([input.ownerId], "owner");
  add(input.reviewerIds, "reviewer");
  add(input.threadAuthorIds ?? [], "participant");
  return recipients;
}
