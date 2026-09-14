/**
 * Marks `User` rows created ahead of time for an address found in a commit
 * trailer (`Reviewed-by:`, `Cc:`, …), before that person ever signed in. They
 * exist so the person can be assigned as a reviewer and have comments
 * attributed to them; nobody occupies them.
 *
 * The distinction matters at sign-in: a placeholder row may be claimed by
 * whoever proves the address, while a row already linked to a Firebase account
 * — or to a service account, whose `firebaseUid` is null — never may.
 */
export const PLACEHOLDER_FIREBASE_UID_PREFIX = "placeholder:";

export function placeholderFirebaseUid(email: string): string {
  return `${PLACEHOLDER_FIREBASE_UID_PREFIX}${email}`;
}

/** A null `firebaseUid` means a service account: it is never claimable. */
export function isPlaceholderFirebaseUid(
  firebaseUid: string | null | undefined,
): boolean {
  return !!firebaseUid?.startsWith(PLACEHOLDER_FIREBASE_UID_PREFIX);
}
