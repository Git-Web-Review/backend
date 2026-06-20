import { ApiProperty } from "@nestjs/swagger";
import { ArrayNotEmpty, IsArray, IsUUID } from "class-validator";

export class MarkNotificationsSeenDto {
  @ApiProperty({
    example: ["9ad1e3de-a9af-4e2f-8d3d-4d6f6c85439a"],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID("4", { each: true })
  notificationIds!: string[];
}
