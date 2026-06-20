import { ApiProperty } from "@nestjs/swagger";

export class ReviewDeletionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  deleted!: boolean;
}
