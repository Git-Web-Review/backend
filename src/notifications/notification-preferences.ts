import { NotificationType } from "@prisma/client";

export const NOTIFICATION_CATEGORIES = [
  "reviewStarted",
  "reviewPending",
  "reviewDone",
  "reviewAcked",
  "reviewClosed",
  "commentReceived",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export type NotificationMedium = "mail" | "irc";

export function notificationCategory(
  type: NotificationType,
  payload: unknown,
): NotificationCategory | null {
  switch (type) {
    case NotificationType.REVIEW_PENDING:
      return "reviewPending";
    case NotificationType.COMMIT_REVIEWED:
      return "reviewDone";
    case NotificationType.COMMENT_RECEIVED:
      return "commentReceived";
    case NotificationType.REVIEW_STATUS_CHANGED: {
      const nextStatus =
        payload && typeof payload === "object" && "nextStatus" in payload
          ? (payload as { nextStatus?: unknown }).nextStatus
          : null;
      switch (nextStatus) {
        case "IN_REVIEW":
          return "reviewStarted";
        case "REVIEWED":
          return "reviewDone";
        case "ACKED":
          return "reviewAcked";
        case "CLOSED":
          return "reviewClosed";
        default:
          return null;
      }
    }
    default:
      return null;
  }
}

export function notificationCategoryEnabled(
  preferences: unknown,
  medium: NotificationMedium,
  category: NotificationCategory | null,
): boolean {
  if (!category) {
    return true;
  }

  if (!preferences || typeof preferences !== "object") {
    return true;
  }

  const mediumPreferences = (
    preferences as Record<NotificationMedium, unknown>
  )[medium];
  if (!mediumPreferences || typeof mediumPreferences !== "object") {
    return true;
  }

  const value = (mediumPreferences as Record<string, unknown>)[category];
  return typeof value === "boolean" ? value : true;
}
