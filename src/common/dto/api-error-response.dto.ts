import { ApiProperty } from "@nestjs/swagger";
import { ErrorCode } from "../error-code.enum";

export class ApiErrorResponseDto {
  @ApiProperty({ enum: ErrorCode })
  code!: ErrorCode;

  @ApiProperty()
  message!: string;
}
