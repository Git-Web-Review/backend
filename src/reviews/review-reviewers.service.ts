import { HttpStatus, Injectable } from "@nestjs/common";
import { AppException } from "../common/app.exception";
import { ErrorCode } from "../common/error-code.enum";
import { placeholderFirebaseUid } from "../common/placeholder-user";
import { PrismaService } from "../prisma/prisma.service";
import {
  isPlausibleEmail,
  MAX_REVIEWER_EMAILS_PER_COMMIT,
} from "./git/commit-message";
import { userSummarySelect, type UserSummary } from "./review-queries";

/** Resolves who may be a reviewer, from ids or from commit trailers. */
@Injectable()
export class ReviewReviewersService {
  constructor(private readonly prisma: PrismaService) {}

  async validReviewerUserIds(
    userIds: string[],
    ownerId: string,
  ): Promise<string[]> {
    const uniqueReviewerIds = [...new Set(userIds)].filter(
      (userId) => userId !== ownerId,
    );
    if (uniqueReviewerIds.length === 0) {
      return [];
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueReviewerIds } },
      select: { id: true },
    });

    if (users.length !== uniqueReviewerIds.length) {
      throw new AppException(
        ErrorCode.USER_NOT_FOUND,
        HttpStatus.BAD_REQUEST,
        "One or more reviewers were not found",
      );
    }

    return uniqueReviewerIds;
  }

  async ensureReviewerUsersByEmails(
    emails: string[],
    ownerId: string,
  ): Promise<UserSummary[]> {
    const uniqueEmails = [
      ...new Set(emails.map((email) => email.toLowerCase())),
    ];
    if (uniqueEmails.length === 0) {
      return [];
    }

    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { email: true },
    });
    const allowedDomains = await this.allowedEmailDomains();
    const reviewerEmails = uniqueEmails
      .filter((email) => email !== owner?.email.toLowerCase())
      .filter((email) => isPlausibleEmail(email))
      // The domain check applied at sign-in but not here: an out-of-domain
      // address cannot sign in, yet it still created a row and could receive
      // notifications.
      .filter(
        (email) =>
          allowedDomains.length === 0 ||
          allowedDomains.includes(email.split("@")[1] ?? ""),
      )
      .slice(0, MAX_REVIEWER_EMAILS_PER_COMMIT);

    await Promise.all(
      reviewerEmails.map((email) =>
        this.prisma.user.upsert({
          where: { email },
          update: {},
          create: {
            firebaseUid: placeholderFirebaseUid(email),
            email,
            hostname: email.split("@")[0] ?? email,
          },
        }),
      ),
    );

    return this.prisma.user.findMany({
      where: { email: { in: reviewerEmails }, id: { not: ownerId } },
      select: userSummarySelect,
      orderBy: { email: "asc" },
    });
  }

  private async allowedEmailDomains(): Promise<string[]> {
    const settings = await this.prisma.globalSettings.findUnique({
      where: { id: "global" },
      select: { allowedOAuthDomains: true },
    });

    return (settings?.allowedOAuthDomains ?? []).map((domain) =>
      domain.toLowerCase(),
    );
  }
}
