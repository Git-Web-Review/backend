import { Body, Get, Patch, Query } from "@nestjs/common";
import { User } from "@prisma/client";
import { ApiAuthenticatedController } from "../auth/api-controller.decorators";
import { CurrentUser } from "../auth/current-user.decorator";
import { ApiEndpoint, ApiTag } from "../common/swagger";
import { BatchPayloadResponseDto } from "./dto/batch-payload-response.dto";
import { ListNotificationsQueryDto } from "./dto/list-notifications-query.dto";
import { MarkNotificationsSeenDto } from "./dto/mark-notifications-seen.dto";
import { NotificationPageResponseDto } from "./dto/notification-page-response.dto";
import { NotificationsService } from "./notifications.service";

@ApiAuthenticatedController(ApiTag.Notifications, "v1/notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiEndpoint({
    summary: "List current user notifications",
    description:
      "Newest first. Notifications are only ever visible to their recipient, so this is always scoped to the caller.",
    response: "Notifications returned",
    type: NotificationPageResponseDto,
    validation: true,
  })
  list(
    @CurrentUser() user: User,
    @Query() query: ListNotificationsQueryDto,
  ): Promise<NotificationPageResponseDto> {
    return this.notificationsService.listForUser(user.id, query);
  }

  @Patch("seen")
  @ApiEndpoint({
    summary: "Mark many notifications as seen",
    description:
      "Identifiers that do not belong to the caller are skipped silently; `count` reports how many were actually updated.",
    response: "Notifications marked as seen",
    type: BatchPayloadResponseDto,
    validation: true,
  })
  markManySeen(
    @CurrentUser() user: User,
    @Body() dto: MarkNotificationsSeenDto,
  ): Promise<BatchPayloadResponseDto> {
    return this.notificationsService.markManySeen(user.id, dto.notificationIds);
  }
}
