import { HttpStatus, Injectable } from "@nestjs/common";
import { ReviewCommitStatus, type User } from "@prisma/client";
import { AppException } from "../common/app.exception";
import { ErrorCode } from "../common/error-code.enum";
import { PrismaService } from "../prisma/prisma.service";
import {
  FileViewedResponseDto,
  SetFileViewedDto,
} from "./dto/set-file-viewed.dto";
import { ReviewResponseDto } from "./dto/review-response.dto";
import { gitDiffFromJson } from "./git/git-diff";
import {
  assertCanResolveComment,
  assertIsReviewer,
  assertNotClosed,
  findCommitOrThrow,
} from "./review-access";
import { ReviewNotificationsService } from "./review-notifications.service";
import { findReviewOrThrow, type ReviewWithRelations } from "./review-queries";
import { ReviewResponsesService } from "./review-responses.service";
import { ReviewStatusService } from "./review-status.service";

/** What reviewers do as they go: acks, reviewed marks and viewed files. */
@Injectable()
export class ReviewProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly responses: ReviewResponsesService,
    private readonly status: ReviewStatusService,
    private readonly reviewNotifications: ReviewNotificationsService,
  ) {}

  async acknowledgeCommit(
    user: User,
    reviewId: string,
    commitId: string,
  ): Promise<ReviewResponseDto> {
    const review = await this.openReviewForReviewer(user, reviewId);
    const commit = findCommitOrThrow(review, commitId);

    await this.prisma.reviewCommitAck.upsert({
      where: {
        reviewCommitId_userId: { reviewCommitId: commit.id, userId: user.id },
      },
      update: { acknowledgedAt: new Date() },
      create: { reviewCommitId: commit.id, userId: user.id },
    });

    return this.refreshedResponse(reviewId, user);
  }

  async unacknowledgeCommit(
    user: User,
    reviewId: string,
    commitId: string,
  ): Promise<ReviewResponseDto> {
    const review = await this.openReviewForReviewer(user, reviewId);
    const commit = findCommitOrThrow(review, commitId);

    await this.prisma.reviewCommitAck.deleteMany({
      where: { reviewCommitId: commit.id, userId: user.id },
    });

    return this.refreshedResponse(reviewId, user);
  }

  async acknowledge(user: User, reviewId: string): Promise<ReviewResponseDto> {
    const review = await this.openReviewForReviewer(user, reviewId);

    await this.prisma.$transaction([
      ...review.commits.map((commit) =>
        this.prisma.reviewCommitAck.upsert({
          where: {
            reviewCommitId_userId: {
              reviewCommitId: commit.id,
              userId: user.id,
            },
          },
          update: { acknowledgedAt: new Date() },
          create: { reviewCommitId: commit.id, userId: user.id },
        }),
      ),
      this.prisma.reviewReviewer.update({
        where: { reviewId_userId: { reviewId, userId: user.id } },
        data: { acknowledgedAt: new Date() },
      }),
    ]);

    return this.refreshedResponse(reviewId, user);
  }

  async unacknowledge(
    user: User,
    reviewId: string,
  ): Promise<ReviewResponseDto> {
    const review = await this.openReviewForReviewer(user, reviewId);

    await this.prisma.$transaction([
      this.prisma.reviewCommitAck.deleteMany({
        where: {
          reviewCommitId: { in: review.commits.map((commit) => commit.id) },
          userId: user.id,
        },
      }),
      this.prisma.reviewReviewer.update({
        where: { reviewId_userId: { reviewId, userId: user.id } },
        data: { acknowledgedAt: null },
      }),
    ]);

    return this.refreshedResponse(reviewId, user);
  }

  async markCommitReviewed(
    user: User,
    reviewId: string,
    commitId: string,
  ): Promise<ReviewResponseDto> {
    const review = await this.openReviewForReviewer(user, reviewId);
    const commit = findCommitOrThrow(review, commitId);

    if (commit.status !== ReviewCommitStatus.ACKED) {
      await this.prisma.reviewCommit.update({
        where: { id: commit.id },
        data: { status: ReviewCommitStatus.REVIEWED },
      });
      await this.reviewNotifications.notifyCommitsReviewed(
        review,
        [commit.title],
        user.id,
      );
    }

    return this.refreshedResponse(reviewId, user);
  }

  async markReviewed(user: User, reviewId: string): Promise<ReviewResponseDto> {
    const review = await this.openReviewForReviewer(user, reviewId);

    const pendingCommits = review.commits.filter(
      (commit) =>
        commit.status !== ReviewCommitStatus.ACKED &&
        commit.status !== ReviewCommitStatus.REVIEWED,
    );
    if (pendingCommits.length > 0) {
      await this.prisma.reviewCommit.updateMany({
        where: { id: { in: pendingCommits.map((commit) => commit.id) } },
        data: { status: ReviewCommitStatus.REVIEWED },
      });
      await this.reviewNotifications.notifyCommitsReviewed(
        review,
        pendingCommits.map((commit) => commit.title),
        user.id,
      );
    }

    return this.refreshedResponse(reviewId, user);
  }

  async setFileViewed(
    user: User,
    reviewId: string,
    commitId: string,
    dto: SetFileViewedDto,
  ): Promise<FileViewedResponseDto> {
    const review = await findReviewOrThrow(this.prisma, reviewId);
    assertCanResolveComment(user, review);
    const commit = findCommitOrThrow(review, commitId);

    const fileExists = gitDiffFromJson(commit.gitDiff).files.some(
      (file) => file.path === dto.filePath,
    );
    if (!fileExists) {
      throw new AppException(
        ErrorCode.UNKNOWN_ERROR,
        HttpStatus.BAD_REQUEST,
        "File not found in the commit diff",
      );
    }

    const fileView = {
      reviewCommitId: commit.id,
      userId: user.id,
      filePath: dto.filePath,
    };
    if (dto.viewed) {
      await this.prisma.reviewFileView.upsert({
        where: { reviewCommitId_userId_filePath: fileView },
        update: {},
        create: fileView,
      });
    } else {
      await this.prisma.reviewFileView.deleteMany({ where: fileView });
    }

    return { commitId: commit.id, filePath: dto.filePath, viewed: dto.viewed };
  }

  /** The review, once checked that the user reviews it and it is still open. */
  private async openReviewForReviewer(
    user: User,
    reviewId: string,
  ): Promise<ReviewWithRelations> {
    const review = await findReviewOrThrow(this.prisma, reviewId);
    assertIsReviewer(user, review);
    assertNotClosed(review);
    return review;
  }

  private async refreshedResponse(
    reviewId: string,
    user: User,
  ): Promise<ReviewResponseDto> {
    const updatedReview = await this.status.refreshFromComments(
      reviewId,
      user.id,
    );
    return this.responses.toResponse(updatedReview);
  }
}
