import { HttpStatus } from "@nestjs/common";
import { ReviewStatus, UserRole, type User } from "@prisma/client";
import { AppException } from "../common/app.exception";
import { ErrorCode } from "../common/error-code.enum";
import type { ReviewWithRelations } from "./review-queries";

export function assertCanRead(user: User, review: ReviewWithRelations): void {
  if (
    user.role === UserRole.ADMIN ||
    review.ownerId === user.id ||
    review.reviewers.some((reviewer) => reviewer.userId === user.id)
  ) {
    return;
  }

  throw new AppException(
    ErrorCode.ROLE_FORBIDDEN,
    HttpStatus.FORBIDDEN,
    "Review access forbidden",
  );
}

export function assertIsOwner(user: User, review: ReviewWithRelations): void {
  if (review.ownerId === user.id) {
    return;
  }

  throw new AppException(
    ErrorCode.ROLE_FORBIDDEN,
    HttpStatus.FORBIDDEN,
    "Only the review owner can update review details",
  );
}

export function assertIsReviewer(
  user: User,
  review: ReviewWithRelations,
): void {
  if (review.reviewers.some((reviewer) => reviewer.userId === user.id)) {
    return;
  }

  throw new AppException(
    ErrorCode.ROLE_FORBIDDEN,
    HttpStatus.FORBIDDEN,
    "Only a review reviewer can update the review status",
  );
}

export function assertCanResolveComment(
  user: User,
  review: ReviewWithRelations,
): void {
  assertIsOwnerOrReviewer(
    user,
    review,
    "Only the review owner or reviewers can mark comments as done",
  );
}

export function assertIsOwnerOrReviewer(
  user: User,
  review: ReviewWithRelations,
  message: string,
): void {
  if (
    review.ownerId === user.id ||
    review.reviewers.some((reviewer) => reviewer.userId === user.id)
  ) {
    return;
  }

  throw new AppException(
    ErrorCode.ROLE_FORBIDDEN,
    HttpStatus.FORBIDDEN,
    message,
  );
}

export function assertNotClosed(review: ReviewWithRelations): void {
  if (review.status === ReviewStatus.CLOSED) {
    throw new AppException(
      ErrorCode.UNKNOWN_ERROR,
      HttpStatus.BAD_REQUEST,
      "Review is closed",
    );
  }
}

export function findCommitOrThrow(
  review: ReviewWithRelations,
  commitId: string,
): ReviewWithRelations["commits"][number] {
  const commit = review.commits.find((item) => item.id === commitId);
  if (!commit) {
    throw new AppException(
      ErrorCode.REVIEW_COMMIT_NOT_FOUND,
      HttpStatus.NOT_FOUND,
      "Review commit not found",
    );
  }

  return commit;
}
