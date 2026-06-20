import { ApiProperty } from "@nestjs/swagger";

export class BatchPayloadResponseDto {
  @ApiProperty()
  count!: number;
}
