import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { AdminGuard } from "../auth/admin.guard";
import { FirebaseAuthGuard } from "../auth/firebase-auth.guard";
import {
  ApiAdminErrorResponses,
  ApiValidationErrorResponse,
} from "../common/swagger/api-error-responses";
import { GlobalSettingsResponseDto } from "./dto/global-settings-response.dto";
import { UpdateGlobalSettingsDto } from "./dto/update-global-settings.dto";
import { SettingsService } from "./settings.service";

@ApiTags("settings")
@ApiBearerAuth()
@ApiAdminErrorResponses()
@UseGuards(FirebaseAuthGuard, AdminGuard)
@Controller("v1/admin/settings")
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: "Get global settings" })
  @ApiOkResponse({
    description: "Global settings returned",
    type: GlobalSettingsResponseDto,
  })
  getGlobalSettings(): Promise<GlobalSettingsResponseDto> {
    return this.settingsService.getGlobalSettings();
  }

  @Patch()
  @ApiOperation({ summary: "Update global settings" })
  @ApiOkResponse({
    description: "Global settings updated",
    type: GlobalSettingsResponseDto,
  })
  @ApiValidationErrorResponse()
  updateGlobalSettings(
    @Body() dto: UpdateGlobalSettingsDto,
  ): Promise<GlobalSettingsResponseDto> {
    return this.settingsService.updateGlobalSettings(dto);
  }
}
