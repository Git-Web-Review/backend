import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { User } from "@prisma/client";
import { CurrentUser } from "../auth/current-user.decorator";
import { FirebaseAuthGuard } from "../auth/firebase-auth.guard";
import {
  ApiAuthErrorResponses,
  ApiNotFoundErrorResponse,
  ApiValidationErrorResponse,
} from "../common/swagger/api-error-responses";
import { CreateReviewCommentDto } from "./dto/create-review-comment.dto";
import { CreateReviewDto } from "./dto/create-review.dto";
import { PreviewReviewDto } from "./dto/preview-review.dto";
import { ReviewCommentResponseDto } from "./dto/review-comment-response.dto";
import { ReviewDashboardQueryDto } from "./dto/review-dashboard-query.dto";
import { ReviewDashboardResponseDto } from "./dto/review-dashboard-response.dto";
import { ReviewDeletionResponseDto } from "./dto/review-deletion-response.dto";
import { ReviewPreviewResponseDto } from "./dto/review-preview-response.dto";
import { ReviewResponseDto } from "./dto/review-response.dto";
import { UpdateReviewCommentDto } from "./dto/update-review-comment.dto";
import { UpdateReviewDto } from "./dto/update-review.dto";
import { ReviewsService } from "./reviews.service";

@ApiTags("reviews")
@ApiBearerAuth()
@ApiAuthErrorResponses()
@UseGuards(FirebaseAuthGuard)
@Controller("v1/reviews")
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get("dashboard")
  @ApiOperation({
    summary: "Get reviews owned by or assigned to the current user",
  })
  @ApiOkResponse({
    description: "Review dashboard returned",
    type: ReviewDashboardResponseDto,
  })
  dashboard(
    @CurrentUser() user: User,
    @Query() query: ReviewDashboardQueryDto,
  ): Promise<ReviewDashboardResponseDto> {
    return this.reviewsService.dashboard(user, query);
  }

  @Post("preview")
  @ApiOperation({
    summary: "Preview extracted review data from a git-web link",
  })
  @ApiOkResponse({
    description: "Review data extracted from git-web",
    type: ReviewPreviewResponseDto,
  })
  @ApiValidationErrorResponse()
  preview(
    @CurrentUser() user: User,
    @Body() dto: PreviewReviewDto,
  ): Promise<ReviewPreviewResponseDto> {
    return this.reviewsService.preview(user, dto);
  }

  @Post()
  @ApiOperation({ summary: "Create a review from a git-web link" })
  @ApiCreatedResponse({
    description: "Review created",
    type: ReviewResponseDto,
  })
  @ApiValidationErrorResponse()
  create(
    @CurrentUser() user: User,
    @Body() dto: CreateReviewDto,
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.create(user.id, dto);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get one review" })
  @ApiOkResponse({ description: "Review returned", type: ReviewResponseDto })
  @ApiNotFoundErrorResponse()
  getOne(
    @CurrentUser() user: User,
    @Param("id") id: string,
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.getOne(user, id);
  }

  @Get(":id/comments")
  @ApiOperation({ summary: "Get review comments" })
  @ApiOkResponse({
    description: "Review comments returned",
    type: [ReviewCommentResponseDto],
  })
  @ApiNotFoundErrorResponse()
  listComments(
    @CurrentUser() user: User,
    @Param("id") id: string,
  ): Promise<ReviewCommentResponseDto[]> {
    return this.reviewsService.listComments(user, id);
  }

  @Post(":id/comments")
  @ApiOperation({ summary: "Add a review comment" })
  @ApiCreatedResponse({
    description: "Review comment added",
    type: ReviewCommentResponseDto,
  })
  @ApiValidationErrorResponse()
  @ApiNotFoundErrorResponse()
  addComment(
    @CurrentUser() user: User,
    @Param("id") id: string,
    @Body() dto: CreateReviewCommentDto,
  ): Promise<ReviewCommentResponseDto> {
    return this.reviewsService.addComment(user, id, dto);
  }

  @Patch(":id/comments/:commentId")
  @ApiOperation({ summary: "Mark a review comment as done or not done" })
  @ApiOkResponse({
    description: "Review comment updated",
    type: [ReviewCommentResponseDto],
  })
  @ApiValidationErrorResponse()
  @ApiNotFoundErrorResponse()
  updateComment(
    @CurrentUser() user: User,
    @Param("id") id: string,
    @Param("commentId") commentId: string,
    @Body() dto: UpdateReviewCommentDto,
  ): Promise<ReviewCommentResponseDto[]> {
    return this.reviewsService.updateComment(user, id, commentId, dto);
  }

  @Patch(":id/ack")
  @ApiOperation({ summary: "Acknowledge a review as reviewer" })
  @ApiOkResponse({
    description: "Review acknowledged",
    type: ReviewResponseDto,
  })
  @ApiValidationErrorResponse()
  @ApiNotFoundErrorResponse()
  acknowledge(
    @CurrentUser() user: User,
    @Param("id") id: string,
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.acknowledge(user, id);
  }

  @Patch(":id/close")
  @ApiOperation({ summary: "Close an acknowledged review" })
  @ApiOkResponse({ description: "Review closed", type: ReviewResponseDto })
  @ApiValidationErrorResponse()
  @ApiNotFoundErrorResponse()
  close(
    @CurrentUser() user: User,
    @Param("id") id: string,
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.close(user, id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update a review owned by the current user" })
  @ApiOkResponse({ description: "Review updated", type: ReviewResponseDto })
  @ApiValidationErrorResponse()
  @ApiNotFoundErrorResponse()
  update(
    @CurrentUser() user: User,
    @Param("id") id: string,
    @Body() dto: UpdateReviewDto,
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.update(user, id, dto);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete a review owned by the current user" })
  @ApiOkResponse({
    description: "Review deleted",
    type: ReviewDeletionResponseDto,
  })
  @ApiNotFoundErrorResponse()
  delete(
    @CurrentUser() user: User,
    @Param("id") id: string,
  ): Promise<ReviewDeletionResponseDto> {
    return this.reviewsService.delete(user, id);
  }
}
