import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { HealthResponseDto } from "./dto/health-response.dto";

@ApiTags("health")
@Controller()
export class HealthController {
  @Get("health")
  @ApiOperation({ summary: "Health check" })
  @ApiOkResponse({ description: "Service is healthy", type: HealthResponseDto })
  health(): HealthResponseDto {
    return { status: "ok" };
  }
}
