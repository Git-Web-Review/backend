import { ApiProperty } from "@nestjs/swagger";
import { NotificationType, Prisma, type Notification } from "@prisma/client";

export class NotificationResponseDto implements Notification {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ enum: NotificationType })
  type!: NotificationType;

  @ApiProperty({ type: Object })
  payload!: Prisma.JsonValue;

  @ApiProperty()
  seen!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  seenAt!: Date | null;
}
