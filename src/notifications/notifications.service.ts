import { HttpStatus, Injectable } from "@nestjs/common";
import { NotificationType, Prisma, type Notification } from "@prisma/client";
import { AppException } from "../common/app.exception";
import { ErrorCode } from "../common/error-code.enum";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { ListNotificationsQueryDto } from "./dto/list-notifications-query.dto";
import {
  notificationCategory,
  notificationCategoryEnabled,
} from "./notification-preferences";

const USER_NOTIFICATION_CHANNEL_PREFIX = "notifications:user";
const IRC_NOTIFICATION_CHANNEL = "notifications:irc";
const EMAIL_NOTIFICATION_CHANNEL = "notifications:email";

type NotificationPage = {
  items: Notification[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async listForUser(
    userId: string,
    query: ListNotificationsQueryDto,
  ): Promise<NotificationPage> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const createdAtFilter: Prisma.DateTimeFilter = {
      ...(query.createdAfter ? { gte: new Date(query.createdAfter) } : {}),
      ...(query.createdBefore ? { lte: new Date(query.createdBefore) } : {}),
    };
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(query.createdAfter || query.createdBefore
        ? { createdAt: createdAtFilter }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async markManySeen(
    userId: string,
    notificationIds: string[],
  ): Promise<Prisma.BatchPayload> {
    const uniqueNotificationIds = [...new Set(notificationIds)];
    const ownedNotificationCount = await this.prisma.notification.count({
      where: { id: { in: uniqueNotificationIds }, userId },
    });

    if (ownedNotificationCount !== uniqueNotificationIds.length) {
      throw new AppException(
        ErrorCode.NOTIFICATION_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        "One or more notifications were not found",
      );
    }

    return this.prisma.notification.updateMany({
      where: { id: { in: uniqueNotificationIds }, userId },
      data: { seen: true, seenAt: new Date() },
    });
  }

  async createForUser(
    userId: string,
    type: NotificationType,
    payload: Prisma.InputJsonValue,
  ): Promise<Notification> {
    const notification = await this.prisma.notification.create({
      data: { userId, type, payload },
      include: { user: { include: { settings: true } } },
    });

    const settings = notification.user.settings;
    const category = notificationCategory(
      notification.type,
      notification.payload,
    );
    const mailEnabled =
      (settings?.mailNotificationsEnabled ?? false) &&
      notificationCategoryEnabled(
        settings?.notificationPreferences,
        "mail",
        category,
      );
    const ircEnabled =
      (settings?.ircNotificationsEnabled ?? false) &&
      notificationCategoryEnabled(
        settings?.notificationPreferences,
        "irc",
        category,
      );

    const event = {
      type: notification.type,
      notificationId: notification.id,
      user: {
        id: notification.user.id,
        email: notification.user.email,
        nickname: settings?.nickname ?? null,
        locale: settings?.locale ?? "FR",
        ircNotificationsEnabled: ircEnabled,
        ircNickname: ircEnabled ? (settings?.ircNickname ?? null) : null,
        mailNotificationsEnabled: mailEnabled,
      },
      payload: notification.payload,
      createdAt: notification.createdAt.toISOString(),
    };

    await Promise.all([
      this.redis.publish(
        `${USER_NOTIFICATION_CHANNEL_PREFIX}:${notification.userId}`,
        event,
      ),
      this.redis.publish(IRC_NOTIFICATION_CHANNEL, event),
      this.redis.publish(EMAIL_NOTIFICATION_CHANNEL, event),
    ]);

    return notification;
  }
}
