import { ApiProperty } from "@nestjs/swagger";
import { NotificationType, Prisma, type Notification } from "@prisma/client";

export class NotificationResponseDto implements Notification {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ enum: NotificationType, enumName: "NotificationType" })
  type!: NotificationType;

  @ApiProperty({
    type: Object,
    description: [
      "Depends on `type`; this is also the `payload` of the webhook envelope.",
      "Review events carry reviewId, title, gitwebUrl, gitwebTitle, ownerEmail, sourceProject, sourceBranch, sourceCommit, and actorEmail, actorNickname when someone acted.",
      "COMMENT_RECEIVED (new thread or reply; sent to the owner, the reviewers and earlier thread authors, never to the author) and COMMENT_MENTION (sent instead of COMMENT_RECEIVED to mentioned users) add commentId (the thread), commentNumber, messageId, isReply, commitHash, filePath, lineNumber, side (all location fields null for a general comment), commentExcerpt and recipientRole (owner | reviewer | participant); COMMENT_MENTION adds addedAsReviewer.",
      "COMMENT_RESOLVED (thread marked done or reopened) adds commentId, commentNumber, done and recipientRole.",
      "COMMIT_ACKED (one commit acked or unacked) adds commitId, commitHash, commitTitle, acked and recipientRole.",
      "COMMENT_RESOLVED and COMMIT_ACKED go to the owner and the reviewers, except the actor.",
    ].join(" "),
  })
  payload!: Prisma.JsonValue;

  @ApiProperty()
  seen!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ type: String, format: "date-time", nullable: true })
  seenAt!: Date | null;
}
