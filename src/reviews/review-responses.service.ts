import { Injectable } from "@nestjs/common";
import type { GitwebUrlRule } from "@prisma/client";
import { GitwebUrlRulesService } from "../gitweb-url-rules/gitweb-url-rules.service";
import { PrismaService } from "../prisma/prisma.service";
import { ReviewCommentResponseDto } from "./dto/review-comment-response.dto";
import { ReviewResponseDto } from "./dto/review-response.dto";
import { gitDiffFromJson, gitDiffFromSnapshot } from "./git/git-diff";
import { mentionedUserIds } from "./mentions";
import {
  mentionedUsersById,
  toUserSummary,
  type ReviewCommentWithMessages,
  type ReviewWithRelations,
} from "./review-queries";

/** Turns review and comment records into the API response shapes. */
@Injectable()
export class ReviewResponsesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gitwebUrlRules: GitwebUrlRulesService,
  ) {}

  async toResponse(
    review: ReviewWithRelations,
    gitwebUrlRules?: GitwebUrlRule[],
  ): Promise<ReviewResponseDto> {
    const { gitwebRawHtml: _gitwebRawHtml, ...reviewWithoutRawHtml } = review;

    return {
      ...reviewWithoutRawHtml,
      gitwebProjectUrl: await this.gitwebUrlRules.gitwebProjectUrl(
        review.gitwebUrl,
        gitwebUrlRules,
      ),
      gitwebRawHtml: null,
      gitDiff: gitDiffFromSnapshot(review.gitwebSnapshot),
      owner: toUserSummary(review.owner),
      commits: review.commits.map((commit) => ({
        ...commit,
        gitDiff: gitDiffFromJson(commit.gitDiff),
        acks: commit.acks.map((ack) => ({
          ...ack,
          user: toUserSummary(ack.user),
        })),
      })),
      reviewers: review.reviewers.map((reviewer) => ({
        ...reviewer,
        user: toUserSummary(reviewer.user),
      })),
    };
  }

  async toCommentResponses(
    comments: ReviewCommentWithMessages[],
  ): Promise<ReviewCommentResponseDto[]> {
    const usersById = await mentionedUsersById(
      this.prisma,
      comments.flatMap((comment) =>
        comment.messages.map((message) => message.message),
      ),
    );

    return comments.flatMap((comment) =>
      comment.messages.map((message) => ({
        id: message.id,
        commentId: comment.id,
        reviewId: comment.reviewId,
        commitHash: comment.commitHash,
        filePath: comment.filePath,
        lineNumber: comment.lineNumber,
        side: comment.side,
        author: toUserSummary(message.from),
        done: comment.done,
        doneBy: comment.doneBy ? toUserSummary(comment.doneBy) : null,
        doneAt: comment.doneAt,
        message: message.message,
        mentions: mentionedUserIds(message.message).flatMap((userId) => {
          const mentionedUser = usersById.get(userId);
          return mentionedUser ? [toUserSummary(mentionedUser)] : [];
        }),
        createdAt: message.createdAt,
      })),
    );
  }
}
