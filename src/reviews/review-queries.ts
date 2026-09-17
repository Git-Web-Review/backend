import { HttpStatus } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AppException } from "../common/app.exception";
import { ErrorCode } from "../common/error-code.enum";
import { PrismaService } from "../prisma/prisma.service";
import { mentionedUserIds } from "./mentions";

export const userSummarySelect = {
  id: true,
  email: true,
  hostname: true,
  settings: {
    select: {
      nickname: true,
      mailNotificationsEnabled: true,
      ircNotificationsEnabled: true,
      profileImageUrl: true,
    },
  },
  profileImage: { select: { userId: true } },
} satisfies Prisma.UserSelect;

export const reviewInclude = {
  owner: { select: userSummarySelect },
  reviewers: {
    orderBy: { requestedAt: "asc" },
    include: { user: { select: userSummarySelect } },
  },
  commits: {
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: {
      acks: {
        orderBy: { acknowledgedAt: "asc" },
        include: { user: { select: userSummarySelect } },
      },
      fileViews: {
        orderBy: { createdAt: "asc" },
      },
    },
  },
  fieldValues: {
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.ReviewInclude;

export const reviewCommentInclude = {
  doneBy: { select: userSummarySelect },
  messages: {
    orderBy: { createdAt: "asc" },
    include: { from: { select: userSummarySelect } },
  },
} satisfies Prisma.ReviewCommentInclude;

export type UserSummary = Prisma.UserGetPayload<{
  select: typeof userSummarySelect;
}>;

export type ReviewWithRelations = Prisma.ReviewGetPayload<{
  include: typeof reviewInclude;
}>;

export type ReviewCommentWithMessages = Prisma.ReviewCommentGetPayload<{
  include: typeof reviewCommentInclude;
}>;

export type ReviewCommitWithAcks = Prisma.ReviewCommitGetPayload<{
  include: { acks: true };
}>;

export type CommentLocation = {
  commitHash: string | null;
  filePath: string | null;
  lineNumber: number | null;
};

export async function findReviewOrThrow(
  prisma: PrismaService,
  reviewId: string,
): Promise<ReviewWithRelations> {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    include: reviewInclude,
  });

  if (!review) {
    throw new AppException(
      ErrorCode.REVIEW_NOT_FOUND,
      HttpStatus.NOT_FOUND,
      "Review not found",
    );
  }

  return review;
}

/** Every user the messages mention, in one query. */
export async function mentionedUsersById(
  prisma: PrismaService,
  messages: string[],
): Promise<Map<string, UserSummary>> {
  const userIds = [...new Set(messages.flatMap(mentionedUserIds))];
  if (userIds.length === 0) {
    return new Map();
  }

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: userSummarySelect,
  });
  return new Map(users.map((user) => [user.id, user]));
}

export function toUserSummary(user: UserSummary) {
  return {
    id: user.id,
    email: user.email,
    hostname: user.hostname,
    nickname: user.settings?.nickname ?? null,
    mailNotificationsEnabled: user.settings?.mailNotificationsEnabled ?? false,
    ircNotificationsEnabled: user.settings?.ircNotificationsEnabled ?? false,
    hasProfileImage: !!user.profileImage,
    profileImageUrl: user.settings?.profileImageUrl ?? null,
  };
}
