import { Body, Controller, Get, Patch, Query, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
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
import { BatchPayloadResponseDto } from "./dto/batch-payload-response.dto";
import { ListNotificationsQueryDto } from "./dto/list-notifications-query.dto";
import { MarkNotificationsSeenDto } from "./dto/mark-notifications-seen.dto";
import { NotificationPageResponseDto } from "./dto/notification-page-response.dto";
import { NotificationsService } from "./notifications.service";

@ApiTags("notifications")
@ApiBearerAuth()
@ApiAuthErrorResponses()
@UseGuards(FirebaseAuthGuard)
@Controller("v1/notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: "List current user notifications" })
  @ApiOkResponse({
    description: "Notifications returned",
    type: NotificationPageResponseDto,
  })
  @ApiValidationErrorResponse()
  list(
    @CurrentUser() user: User,
    @Query() query: ListNotificationsQueryDto,
  ): Promise<NotificationPageResponseDto> {
    return this.notificationsService.listForUser(user.id, query);
  }

  @Patch("seen")
  @ApiOperation({ summary: "Mark many notifications as seen" })
  @ApiOkResponse({
    description: "Notifications marked as seen",
    type: BatchPayloadResponseDto,
  })
  @ApiValidationErrorResponse()
  @ApiNotFoundErrorResponse()
  markManySeen(
    @CurrentUser() user: User,
    @Body() dto: MarkNotificationsSeenDto,
  ): Promise<BatchPayloadResponseDto> {
    return this.notificationsService.markManySeen(user.id, dto.notificationIds);
  }
}
