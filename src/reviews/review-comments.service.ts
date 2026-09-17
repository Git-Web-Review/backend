import { HttpStatus, Injectable } from "@nestjs/common";
import { ReviewCommentSide, type User } from "@prisma/client";
import { AppException } from "../common/app.exception";
import { DeletionResponseDto } from "../common/dto/deletion-response.dto";
import { ErrorCode } from "../common/error-code.enum";
import { PrismaService } from "../prisma/prisma.service";
import { CreateReviewCommentMessageDto } from "./dto/create-review-comment-message.dto";
import { CreateReviewCommentDto } from "./dto/create-review-comment.dto";
import { ReviewCommentResponseDto } from "./dto/review-comment-response.dto";
import { UpdateReviewCommentMessageDto } from "./dto/update-review-comment-message.dto";
import { UpdateReviewCommentDto } from "./dto/update-review-comment.dto";
import { assertCanRead, assertCanResolveComment } from "./review-access";
import { ReviewNotificationsService } from "./review-notifications.service";
import {
  findReviewOrThrow,
  reviewCommentInclude,
  type ReviewCommentWithMessages,
  type ReviewWithRelations,
} from "./review-queries";
import { ReviewResponsesService } from "./review-responses.service";
import { ReviewStatusService } from "./review-status.service";
import { nullIfBlank } from "./review-text";

/** Comment threads on a review and the messages inside them. */
@Injectable()
export class ReviewCommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly responses: ReviewResponsesService,
    private readonly status: ReviewStatusService,
    private readonly reviewNotifications: ReviewNotificationsService,
  ) {}

  async listComments(
    user: User,
    reviewId: string,
  ): Promise<ReviewCommentResponseDto[]> {
    const review = await findReviewOrThrow(this.prisma, reviewId);
    assertCanRead(user, review);

    const comments = await this.prisma.reviewComment.findMany({
      where: { reviewId },
      orderBy: { createdAt: "asc" },
      include: reviewCommentInclude,
    });

    return this.responses.toCommentResponses(comments);
  }

  async addComment(
    user: User,
    reviewId: string,
    dto: CreateReviewCommentDto,
  ): Promise<ReviewCommentResponseDto> {
    const review = await findReviewOrThrow(this.prisma, reviewId);
    assertCanRead(user, review);
    const message = requireMessage(dto.message);

    const comment = await this.prisma.reviewComment.create({
      data: {
        reviewId,
        commitHash: nullIfBlank(dto.commitHash),
        filePath: nullIfBlank(dto.filePath),
        lineNumber: dto.lineNumber ?? null,
        side: dto.side ?? ReviewCommentSide.AFTER,
        messages: {
          create: {
            fromId: user.id,
            message,
          },
        },
      },
      include: reviewCommentInclude,
    });

    await this.afterMessagePosted(user, review, comment, message);

    return (await this.responses.toCommentResponses([comment]))[0];
  }

  async addCommentMessage(
    user: User,
    reviewId: string,
    commentId: string,
    dto: CreateReviewCommentMessageDto,
  ): Promise<ReviewCommentResponseDto[]> {
    const review = await findReviewOrThrow(this.prisma, reviewId);
    assertCanRead(user, review);
    const message = requireMessage(dto.message);

    commentOrThrow(
      await this.prisma.reviewComment.findFirst({
        where: { id: commentId, reviewId },
        select: { id: true },
      }),
    );

    const updatedComment = await this.prisma.reviewComment.update({
      where: { id: commentId },
      data: {
        done: false,
        doneById: null,
        doneAt: null,
        messages: {
          create: {
            fromId: user.id,
            message,
          },
        },
      },
      include: reviewCommentInclude,
    });

    await this.afterMessagePosted(user, review, updatedComment, message);

    return this.responses.toCommentResponses([updatedComment]);
  }

  async updateComment(
    user: User,
    reviewId: string,
    commentId: string,
    dto: UpdateReviewCommentDto,
  ): Promise<ReviewCommentResponseDto[]> {
    const review = await findReviewOrThrow(this.prisma, reviewId);
    assertCanResolveComment(user, review);

    commentOrThrow(
      await this.prisma.reviewComment.findFirst({
        where: { id: commentId, reviewId },
        select: { id: true },
      }),
    );

    const updatedComment = await this.prisma.reviewComment.update({
      where: { id: commentId },
      data: dto.done
        ? { done: true, doneById: user.id, doneAt: new Date() }
        : { done: false, doneById: null, doneAt: null },
      include: reviewCommentInclude,
    });

    await this.status.refreshFromComments(reviewId, user.id);

    return this.responses.toCommentResponses([updatedComment]);
  }

  async deleteComment(
    user: User,
    reviewId: string,
    commentId: string,
  ): Promise<DeletionResponseDto> {
    const review = await findReviewOrThrow(this.prisma, reviewId);
    assertCanRead(user, review);

    const comment = commentOrThrow(
      await this.prisma.reviewComment.findFirst({
        where: { id: commentId, reviewId },
        select: { id: true, messages: { select: { fromId: true } } },
      }),
    );

    if (
      comment.messages.length === 0 ||
      comment.messages.some((message) => message.fromId !== user.id)
    ) {
      throw notCommentOwner("delete");
    }

    await this.prisma.reviewComment.delete({ where: { id: commentId } });

    await this.status.refreshFromComments(reviewId, user.id);

    return { id: commentId, deleted: true };
  }

  async deleteCommentMessage(
    user: User,
    reviewId: string,
    commentId: string,
    messageId: string,
  ): Promise<DeletionResponseDto> {
    const review = await findReviewOrThrow(this.prisma, reviewId);
    assertCanRead(user, review);

    const comment = commentOrThrow(
      await this.prisma.reviewComment.findFirst({
        where: { id: commentId, reviewId },
        select: {
          id: true,
          messages: { select: { id: true, fromId: true } },
        },
      }),
    );
    ownMessageOrThrow(comment.messages, messageId, user, "delete");

    await this.prisma.reviewCommentMessage.delete({ where: { id: messageId } });

    if (comment.messages.length === 1) {
      await this.prisma.reviewComment.delete({ where: { id: commentId } });
    }

    await this.status.refreshFromComments(reviewId, user.id);

    return { id: messageId, deleted: true };
  }

  async updateCommentMessage(
    user: User,
    reviewId: string,
    commentId: string,
    messageId: string,
    dto: UpdateReviewCommentMessageDto,
  ): Promise<ReviewCommentResponseDto[]> {
    const review = await findReviewOrThrow(this.prisma, reviewId);
    assertCanRead(user, review);
    const nextMessage = requireMessage(dto.message);

    const comment = commentOrThrow(
      await this.prisma.reviewComment.findFirst({
        where: { id: commentId, reviewId },
        select: {
          id: true,
          messages: { select: { id: true, fromId: true, message: true } },
        },
      }),
    );
    const message = ownMessageOrThrow(
      comment.messages,
      messageId,
      user,
      "edit",
    );

    await this.prisma.reviewCommentMessage.update({
      where: { id: messageId },
      data: { message: nextMessage },
    });

    const updatedComment = await this.prisma.reviewComment.findUniqueOrThrow({
      where: { id: commentId },
      include: reviewCommentInclude,
    });

    await this.reviewNotifications.notifyMentionedUsers(
      review,
      updatedComment,
      nextMessage,
      message.message,
      user.id,
    );

    return this.responses.toCommentResponses([updatedComment]);
  }

  /** Status refresh and notifications shared by every new message. */
  private async afterMessagePosted(
    user: User,
    review: ReviewWithRelations,
    comment: ReviewCommentWithMessages,
    message: string,
  ): Promise<void> {
    await this.status.updateAfterComment(user, review);
    const mentionedRecipientIds =
      await this.reviewNotifications.notifyMentionedUsers(
        review,
        comment,
        message,
        null,
        user.id,
      );
    await this.reviewNotifications.notifyCommentReceived(
      review,
      comment,
      message,
      user.id,
      mentionedRecipientIds,
    );
  }
}

function requireMessage(raw: string): string {
  const message = raw.trim();
  if (!message) {
    throw new AppException(
      ErrorCode.UNKNOWN_ERROR,
      HttpStatus.BAD_REQUEST,
      "Comment message cannot be empty",
    );
  }
  return message;
}

function commentOrThrow<T>(comment: T | null): T {
  if (!comment) {
    throw new AppException(
      ErrorCode.COMMENT_NOT_FOUND,
      HttpStatus.NOT_FOUND,
      "Comment not found",
    );
  }
  return comment;
}

function ownMessageOrThrow<T extends { id: string; fromId: string }>(
  messages: T[],
  messageId: string,
  user: User,
  action: "delete" | "edit",
): T {
  const message = messages.find((item) => item.id === messageId);
  if (!message) {
    throw new AppException(
      ErrorCode.COMMENT_NOT_FOUND,
      HttpStatus.NOT_FOUND,
      "Comment message not found",
    );
  }

  if (message.fromId !== user.id) {
    throw notCommentOwner(action);
  }

  return message;
}

function notCommentOwner(action: "delete" | "edit"): AppException {
  return new AppException(
    ErrorCode.ROLE_FORBIDDEN,
    HttpStatus.FORBIDDEN,
    `Only the comment owner can ${action} this comment`,
  );
}
