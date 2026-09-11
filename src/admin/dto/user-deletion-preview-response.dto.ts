import { ApiProperty } from "@nestjs/swagger";

export class UserDeletionPreviewResponseDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({
    description: "False when the user signed in through Firebase at least once",
  })
  deletable!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "Error code explaining why the user cannot be deleted",
  })
  blockedBy!: string | null;

  @ApiProperty({ description: "The user is the identity of a service account" })
  isServiceAccount!: boolean;

  @ApiProperty({ description: "Reviews owned by the user, deleted with it" })
  ownedReviews!: number;

  @ApiProperty({
    description: "Comments living on those reviews, deleted with them",
  })
  commentsOnOwnedReviews!: number;

  @ApiProperty({
    description:
      "Messages written by other people on those reviews, deleted with them",
  })
  foreignMessagesOnOwnedReviews!: number;

  @ApiProperty({
    description: "Messages written by the user anywhere else, deleted too",
  })
  authoredMessages!: number;

  @ApiProperty()
  reviewerAssignments!: number;

  @ApiProperty()
  commitAcks!: number;

  @ApiProperty()
  fileViews!: number;

  @ApiProperty()
  notifications!: number;
}
