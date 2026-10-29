import { NotificationType } from "@prisma/client";

export const NOTIFICATION_CATEGORIES = [
  "reviewStarted",
  "reviewPending",
  "reviewDone",
  "reviewAcked",
  "reviewClosed",
  "commentReceived",
  "commentMention",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export type NotificationMedium = "mail" | "irc" | "webhook";

export function notificationCategory(
  type: NotificationType,
  payload: unknown,
): NotificationCategory | null {
  switch (type) {
    case NotificationType.REVIEW_PENDING:
      return "reviewPending";
    case NotificationType.REVIEW_NEW_VERSION:
      return "reviewPending";
    case NotificationType.COMMIT_REVIEWED:
      return "reviewDone";
    case NotificationType.COMMENT_RECEIVED:
      return "commentReceived";
    case NotificationType.COMMENT_MENTION:
      return "commentMention";
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

/** The user's own printf-style format for this type, per medium, if any. */
export function notificationFormats(
  formats: unknown,
  type: NotificationType,
): Record<"irc" | "mail", string | null> {
  const formatFor = (medium: "irc" | "mail") => {
    const mediumFormats =
      formats && typeof formats === "object"
        ? (formats as Record<string, unknown>)[medium]
        : null;
    const value =
      mediumFormats && typeof mediumFormats === "object"
        ? (mediumFormats as Record<string, unknown>)[type]
        : null;
    return typeof value === "string" && value.trim() ? value : null;
  };

  return { irc: formatFor("irc"), mail: formatFor("mail") };
}
