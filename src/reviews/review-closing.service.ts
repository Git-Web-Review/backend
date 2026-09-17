import { HttpStatus, Injectable } from "@nestjs/common";
import { ReviewStatus, type User } from "@prisma/client";
import { AppException } from "../common/app.exception";
import { ErrorCode } from "../common/error-code.enum";
import { PrismaService } from "../prisma/prisma.service";
import { ReviewResponseDto } from "./dto/review-response.dto";
import { runGit, ensureGitCache } from "./git/git-runner";
import type { GitwebMetadata } from "./gitweb/gitweb-metadata";
import { GitwebMetadataService } from "./gitweb/gitweb-metadata.service";
import { assertIsOwner } from "./review-access";
import { ReviewNotificationsService } from "./review-notifications.service";
import {
  findReviewOrThrow,
  reviewInclude,
  type ReviewWithRelations,
} from "./review-queries";
import { ReviewResponsesService } from "./review-responses.service";

/** Closing reviews, by their owner or once their commits reached master. */
@Injectable()
export class ReviewClosingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly responses: ReviewResponsesService,
    private readonly reviewNotifications: ReviewNotificationsService,
    private readonly gitwebMetadata: GitwebMetadataService,
  ) {}

  async close(user: User, reviewId: string): Promise<ReviewResponseDto> {
    const review = await findReviewOrThrow(this.prisma, reviewId);
    assertIsOwner(user, review);

    if (review.status === ReviewStatus.CLOSED) {
      return this.responses.toResponse(review);
    }

    if (review.status !== ReviewStatus.ACKED) {
      throw new AppException(
        ErrorCode.UNKNOWN_ERROR,
        HttpStatus.BAD_REQUEST,
        "Review must be acked before it can be closed",
      );
    }

    const closedReview = await this.prisma.review.update({
      where: { id: reviewId },
      data: { status: ReviewStatus.CLOSED },
      include: reviewInclude,
    });

    await this.reviewNotifications.notifyReviewStatusChanged(
      closedReview,
      review.status,
      closedReview.status,
      user.id,
    );

    return this.responses.toResponse(closedReview);
  }

  async closeAckedReviewsMergedOnMaster(): Promise<number> {
    const ackedReviews = await this.prisma.review.findMany({
      where: { status: ReviewStatus.ACKED },
      include: reviewInclude,
    });

    let closedCount = 0;
    for (const review of ackedReviews) {
      try {
        if (!(await this.reviewMergedOnMaster(review))) {
          continue;
        }
      } catch {
        continue;
      }

      const closedReview = await this.prisma.review.update({
        where: { id: review.id },
        data: { status: ReviewStatus.CLOSED },
        include: reviewInclude,
      });
      await this.reviewNotifications.notifyReviewStatusChanged(
        closedReview,
        ReviewStatus.ACKED,
        ReviewStatus.CLOSED,
        "",
      );
      closedCount += 1;
    }

    return closedCount;
  }

  private async reviewMergedOnMaster(
    review: ReviewWithRelations,
  ): Promise<boolean> {
    if (review.commits.length === 0) {
      return false;
    }

    let metadata: GitwebMetadata;
    try {
      metadata = await this.gitwebMetadata.metadataFromUrl(review.gitwebUrl);
    } catch {
      return false;
    }
    if (!metadata.remoteUrl) {
      return false;
    }

    const repoPath = await ensureGitCache(metadata.remoteUrl);
    await runGit([
      "-C",
      repoPath,
      "fetch",
      "--depth=300",
      metadata.remoteUrl,
      "+refs/remotes/origin/master:refs/gwr/master",
    ]);

    for (const commit of review.commits) {
      await runGit([
        "-C",
        repoPath,
        "fetch",
        "--depth=2",
        metadata.remoteUrl,
        commit.hash,
      ]);

      // "git cherry" marks the commit with "-" when a patch-equivalent
      // commit exists upstream, which also covers rebased commits.
      const cherry = await runGit([
        "-C",
        repoPath,
        "cherry",
        "refs/gwr/master",
        commit.hash,
        `${commit.hash}~1`,
      ]);
      const lines = cherry.split("\n").filter((line) => line.trim());
      if (lines.some((line) => line.startsWith("+"))) {
        return false;
      }
    }

    return true;
  }
}
