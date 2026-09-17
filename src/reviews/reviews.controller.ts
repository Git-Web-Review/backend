import { Body, Delete, Get, Patch, Post, Put, Query } from "@nestjs/common";
import { User } from "@prisma/client";
import { ApiAuthenticatedController } from "../auth/api-controller.decorators";
import { ThrottleGit } from "../common/throttling/throttling.module";
import { CurrentUser } from "../auth/current-user.decorator";
import { DeletionResponseDto } from "../common/dto/deletion-response.dto";
import { ApiEndpoint, ApiTag, UuidParam } from "../common/swagger";
import { AddReviewReviewersDto } from "./dto/add-review-reviewers.dto";
import { CreateReviewCommentDto } from "./dto/create-review-comment.dto";
import { CreateReviewCommentMessageDto } from "./dto/create-review-comment-message.dto";
import { CreateReviewDto } from "./dto/create-review.dto";
import { PreviewReviewDto } from "./dto/preview-review.dto";
import { ReviewCommentResponseDto } from "./dto/review-comment-response.dto";
import { ReviewDashboardQueryDto } from "./dto/review-dashboard-query.dto";
import { ReviewDashboardResponseDto } from "./dto/review-dashboard-response.dto";
import { ReviewPreviewResponseDto } from "./dto/review-preview-response.dto";
import { ReviewResponseDto } from "./dto/review-response.dto";
import { ReviewSyncPreviewResponseDto } from "./dto/review-sync-preview-response.dto";
import {
  FileViewedResponseDto,
  SetFileViewedDto,
} from "./dto/set-file-viewed.dto";
import { SetReviewFieldValueDto } from "./dto/set-review-field-value.dto";
import { SyncReviewDto } from "./dto/sync-review.dto";
import { UpdateReviewCommentMessageDto } from "./dto/update-review-comment-message.dto";
import { UpdateReviewCommentDto } from "./dto/update-review-comment.dto";
import { UpdateReviewDto } from "./dto/update-review.dto";
import { ReviewsService } from "./reviews.service";

/** Path parameter descriptions, written once for the twenty routes using them. */
const REVIEW_ID = "Review identifier";
const COMMENT_ID = "Identifier of a comment thread on the review";
const MESSAGE_ID = "Identifier of one message inside the comment thread";
const COMMIT_ID = "Identifier of a commit inside the review";
const FIELD_ID = "Identifier of a review field definition";

@ApiAuthenticatedController(ApiTag.Reviews, "v1/reviews")
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get("dashboard")
  @ApiEndpoint({
    summary: "Get reviews owned by or assigned to the current user",
    description:
      "Three independently paginated lists in one call: reviews the caller created, reviews assigned to them, and reviews already closed.",
    response: "Review dashboard returned",
    type: ReviewDashboardResponseDto,
    validation: true,
  })
  dashboard(
    @CurrentUser() user: User,
    @Query() query: ReviewDashboardQueryDto,
  ): Promise<ReviewDashboardResponseDto> {
    return this.reviewsService.dashboard(user, query);
  }

  @Post("preview")
  @ThrottleGit()
  @ApiEndpoint({
    summary: "Preview extracted review data from a git-web link",
    description:
      "Fetches and parses the link without creating anything. Use it to show the caller which commits a link resolves to before committing to `POST /v1/reviews`.",
    response: "Review data extracted from git-web",
    type: ReviewPreviewResponseDto,
    validation: true,
  })
  preview(
    @CurrentUser() user: User,
    @Body() dto: PreviewReviewDto,
  ): Promise<ReviewPreviewResponseDto> {
    return this.reviewsService.preview(user, dto);
  }

  @Post()
  @ThrottleGit()
  @ApiEndpoint({
    summary: "Create a review from a git-web link",
    description:
      "The link is parsed through the git-web URL rules, the repository is cloned, and the selected commits become the first version of the review.",
    response: "Review created",
    type: ReviewResponseDto,
    created: true,
    validation: true,
  })
  create(
    @CurrentUser() user: User,
    @Body() dto: CreateReviewDto,
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.create(user.id, dto);
  }

  @Get(":id")
  @ApiEndpoint({
    summary: "Get one review",
    description:
      "The full review: commits, diffs, reviewers, field values and acknowledgement state.",
    response: "Review returned",
    type: ReviewResponseDto,
    notFound: true,
  })
  getOne(
    @CurrentUser() user: User,
    @UuidParam("id", REVIEW_ID) id: string,
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.getOne(user, id);
  }

  @Post(":id/sync/preview")
  @ThrottleGit()
  @ApiEndpoint({
    summary:
      "Preview the branch changes that would produce a new review version",
    description:
      "Reports which commits were added, removed or amended since the current version, without changing anything.",
    response: "Sync preview returned",
    type: ReviewSyncPreviewResponseDto,
    notFound: true,
  })
  syncPreview(
    @CurrentUser() user: User,
    @UuidParam("id", REVIEW_ID) id: string,
  ): Promise<ReviewSyncPreviewResponseDto> {
    return this.reviewsService.syncPreview(user, id);
  }

  @Post(":id/sync")
  @ThrottleGit()
  @ApiEndpoint({
    summary: "Synchronize the review with its branch as a new version",
    description:
      "Creates a new version from the branch. Existing comments are carried over; acknowledgements on changed commits are reset.",
    response: "Review synchronized",
    type: ReviewResponseDto,
    validation: true,
    notFound: true,
  })
  sync(
    @CurrentUser() user: User,
    @UuidParam("id", REVIEW_ID) id: string,
    @Body() dto: SyncReviewDto,
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.sync(user, id, dto);
  }

  @Put(":id/fields/:fieldId")
  @ApiEndpoint({
    summary: "Set a review field value",
    description:
      "The field must exist in `GET /v1/review-fields`. A blank or null value clears it.",
    response: "Review field value updated",
    type: ReviewResponseDto,
    validation: true,
    notFound: true,
  })
  setFieldValue(
    @CurrentUser() user: User,
    @UuidParam("id", REVIEW_ID) id: string,
    @UuidParam("fieldId", FIELD_ID) fieldId: string,
    @Body() dto: SetReviewFieldValueDto,
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.setFieldValue(user, id, fieldId, dto);
  }

  @Get(":id/comments")
  @ApiEndpoint({
    summary: "Get review comments",
    description:
      "Every comment thread on the review, each holding its ordered messages.",
    response: "Review comments returned",
    type: [ReviewCommentResponseDto],
    notFound: true,
  })
  listComments(
    @CurrentUser() user: User,
    @UuidParam("id", REVIEW_ID) id: string,
  ): Promise<ReviewCommentResponseDto[]> {
    return this.reviewsService.listComments(user, id);
  }

  @Post(":id/comments")
  @ApiEndpoint({
    summary: "Add a review comment",
    description:
      "Opens a new thread, either on the review as a whole or anchored to a line of a commit diff.",
    response: "Review comment added",
    type: ReviewCommentResponseDto,
    created: true,
    validation: true,
    notFound: true,
  })
  addComment(
    @CurrentUser() user: User,
    @UuidParam("id", REVIEW_ID) id: string,
    @Body() dto: CreateReviewCommentDto,
  ): Promise<ReviewCommentResponseDto> {
    return this.reviewsService.addComment(user, id, dto);
  }

  @Post(":id/comments/:commentId/messages")
  @ApiEndpoint({
    summary: "Reply to a review comment conversation",
    description: "Returns every thread on the review, not just the one replied to.",
    response: "Review comment reply added",
    type: [ReviewCommentResponseDto],
    created: true,
    validation: true,
    notFound: true,
  })
  addCommentMessage(
    @CurrentUser() user: User,
    @UuidParam("id", REVIEW_ID) id: string,
    @UuidParam("commentId", COMMENT_ID) commentId: string,
    @Body() dto: CreateReviewCommentMessageDto,
  ): Promise<ReviewCommentResponseDto[]> {
    return this.reviewsService.addCommentMessage(user, id, commentId, dto);
  }

  @Patch(":id/comments/:commentId/messages/:messageId")
  @ApiEndpoint({
    summary: "Edit a review comment message owned by the current user",
    response: "Review comment message updated",
    type: [ReviewCommentResponseDto],
    validation: true,
    notFound: true,
  })
  updateCommentMessage(
    @CurrentUser() user: User,
    @UuidParam("id", REVIEW_ID) id: string,
    @UuidParam("commentId", COMMENT_ID) commentId: string,
    @UuidParam("messageId", MESSAGE_ID) messageId: string,
    @Body() dto: UpdateReviewCommentMessageDto,
  ): Promise<ReviewCommentResponseDto[]> {
    return this.reviewsService.updateCommentMessage(
      user,
      id,
      commentId,
      messageId,
      dto,
    );
  }

  @Delete(":id/comments/:commentId/messages/:messageId")
  @ApiEndpoint({
    summary: "Delete a review comment message owned by the current user",
    description:
      "Deleting the last message of a thread deletes the thread as well.",
    response: "Review comment message deleted",
    type: DeletionResponseDto,
    notFound: true,
  })
  deleteCommentMessage(
    @CurrentUser() user: User,
    @UuidParam("id", REVIEW_ID) id: string,
    @UuidParam("commentId", COMMENT_ID) commentId: string,
    @UuidParam("messageId", MESSAGE_ID) messageId: string,
  ): Promise<DeletionResponseDto> {
    return this.reviewsService.deleteCommentMessage(
      user,
      id,
      commentId,
      messageId,
    );
  }

  @Patch(":id/comments/:commentId")
  @ApiEndpoint({
    summary: "Mark a review comment as done or not done",
    response: "Review comment updated",
    type: [ReviewCommentResponseDto],
    validation: true,
    notFound: true,
  })
  updateComment(
    @CurrentUser() user: User,
    @UuidParam("id", REVIEW_ID) id: string,
    @UuidParam("commentId", COMMENT_ID) commentId: string,
    @Body() dto: UpdateReviewCommentDto,
  ): Promise<ReviewCommentResponseDto[]> {
    return this.reviewsService.updateComment(user, id, commentId, dto);
  }

  @Delete(":id/comments/:commentId")
  @ApiEndpoint({
    summary: "Delete a review comment owned by the current user",
    description: "Removes the thread and all of its messages.",
    response: "Review comment deleted",
    type: DeletionResponseDto,
    notFound: true,
  })
  deleteComment(
    @CurrentUser() user: User,
    @UuidParam("id", REVIEW_ID) id: string,
    @UuidParam("commentId", COMMENT_ID) commentId: string,
  ): Promise<DeletionResponseDto> {
    return this.reviewsService.deleteComment(user, id, commentId);
  }

  @Patch(":id/ack")
  @ApiEndpoint({
    summary: "Acknowledge all review commits as reviewer",
    description:
      "The reviewer's sign-off on the whole review. Only an assigned reviewer can acknowledge.",
    response: "Review acknowledged",
    type: ReviewResponseDto,
    validation: true,
    notFound: true,
  })
  acknowledge(
    @CurrentUser() user: User,
    @UuidParam("id", REVIEW_ID) id: string,
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.acknowledge(user, id);
  }

  @Delete(":id/ack")
  @ApiEndpoint({
    summary: "Withdraw the reviewer acknowledgement of all commits",
    response: "Review acknowledgement withdrawn",
    type: ReviewResponseDto,
    validation: true,
    notFound: true,
  })
  unacknowledge(
    @CurrentUser() user: User,
    @UuidParam("id", REVIEW_ID) id: string,
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.unacknowledge(user, id);
  }

  @Patch(":id/commits/:commitId/ack")
  @ApiEndpoint({
    summary: "Acknowledge a single review commit as reviewer",
    response: "Review commit acknowledged",
    type: ReviewResponseDto,
    validation: true,
    notFound: true,
  })
  acknowledgeCommit(
    @CurrentUser() user: User,
    @UuidParam("id", REVIEW_ID) id: string,
    @UuidParam("commitId", COMMIT_ID) commitId: string,
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.acknowledgeCommit(user, id, commitId);
  }

  @Delete(":id/commits/:commitId/ack")
  @ApiEndpoint({
    summary: "Withdraw the acknowledgement of a single commit",
    response: "Review commit acknowledgement withdrawn",
    type: ReviewResponseDto,
    validation: true,
    notFound: true,
  })
  unacknowledgeCommit(
    @CurrentUser() user: User,
    @UuidParam("id", REVIEW_ID) id: string,
    @UuidParam("commitId", COMMIT_ID) commitId: string,
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.unacknowledgeCommit(user, id, commitId);
  }

  @Put(":id/commits/:commitId/files/viewed")
  @ApiEndpoint({
    summary: "Mark a commit diff file as viewed or not viewed",
    description:
      "Per-reviewer reading progress. `filePath` must match a path present in the commit diff.",
    response: "File view state updated",
    type: FileViewedResponseDto,
    validation: true,
    notFound: true,
  })
  setFileViewed(
    @CurrentUser() user: User,
    @UuidParam("id", REVIEW_ID) id: string,
    @UuidParam("commitId", COMMIT_ID) commitId: string,
    @Body() dto: SetFileViewedDto,
  ): Promise<FileViewedResponseDto> {
    return this.reviewsService.setFileViewed(user, id, commitId, dto);
  }

  @Patch(":id/reviewed")
  @ApiEndpoint({
    summary: "Mark all review commits as reviewed",
    description:
      "The author's own progress marker, independent of the reviewer acknowledgement.",
    response: "Review marked as reviewed",
    type: ReviewResponseDto,
    validation: true,
    notFound: true,
  })
  markReviewed(
    @CurrentUser() user: User,
    @UuidParam("id", REVIEW_ID) id: string,
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.markReviewed(user, id);
  }

  @Patch(":id/commits/:commitId/reviewed")
  @ApiEndpoint({
    summary: "Mark a single review commit as reviewed",
    response: "Review commit marked as reviewed",
    type: ReviewResponseDto,
    validation: true,
    notFound: true,
  })
  markCommitReviewed(
    @CurrentUser() user: User,
    @UuidParam("id", REVIEW_ID) id: string,
    @UuidParam("commitId", COMMIT_ID) commitId: string,
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.markCommitReviewed(user, id, commitId);
  }

  @Patch(":id/close")
  @ApiEndpoint({
    summary: "Close an acknowledged review",
    description: "Moves the review to the done list. It stays readable.",
    response: "Review closed",
    type: ReviewResponseDto,
    validation: true,
    notFound: true,
  })
  close(
    @CurrentUser() user: User,
    @UuidParam("id", REVIEW_ID) id: string,
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.close(user, id);
  }

  @Post(":id/reviewers")
  @ApiEndpoint({
    summary: "Add reviewers to a review",
    description:
      "Open to the owner and to the reviewers of the review. Users already reviewing are kept as they are, the owner is ignored, and only the reviewers actually added are notified. Removing a reviewer stays with the owner, through `PATCH /v1/reviews/{id}`.",
    response: "Reviewers added",
    type: ReviewResponseDto,
    validation: true,
    notFound: true,
    forbidden: "The caller is neither the owner nor a reviewer of the review",
  })
  addReviewers(
    @CurrentUser() user: User,
    @UuidParam("id", REVIEW_ID) id: string,
    @Body() dto: AddReviewReviewersDto,
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.addReviewers(user, id, dto);
  }

  @Patch(":id")
  @ApiEndpoint({
    summary: "Update a review owned by the current user",
    description:
      "Changes the title, description or reviewer list. Only the properties present in the body are applied.",
    response: "Review updated",
    type: ReviewResponseDto,
    validation: true,
    notFound: true,
  })
  update(
    @CurrentUser() user: User,
    @UuidParam("id", REVIEW_ID) id: string,
    @Body() dto: UpdateReviewDto,
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.update(user, id, dto);
  }

  @Delete(":id")
  @ApiEndpoint({
    summary: "Delete a review owned by the current user",
    description:
      "Removes the review, its versions and every comment left on it, including other people's.",
    response: "Review deleted",
    type: DeletionResponseDto,
    notFound: true,
  })
  delete(
    @CurrentUser() user: User,
    @UuidParam("id", REVIEW_ID) id: string,
  ): Promise<DeletionResponseDto> {
    return this.reviewsService.delete(user, id);
  }
}
