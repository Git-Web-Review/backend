import { Body, Get, Patch } from "@nestjs/common";
import { ApiAdminController } from "../auth/api-controller.decorators";
import { ApiEndpoint, ApiTag } from "../common/swagger";
import { GlobalSettingsResponseDto } from "./dto/global-settings-response.dto";
import { UpdateGlobalSettingsDto } from "./dto/update-global-settings.dto";
import { SettingsService } from "./settings.service";

@ApiAdminController(ApiTag.Settings, "v1/admin/settings")
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiEndpoint({
    summary: "Get global settings",
    description:
      "Instance-wide configuration: allowed OAuth domains and notification defaults.",
    response: "Global settings returned",
    type: GlobalSettingsResponseDto,
  })
  getGlobalSettings(): Promise<GlobalSettingsResponseDto> {
    return this.settingsService.getGlobalSettings();
  }

  @Patch()
  @ApiEndpoint({
    summary: "Update global settings",
    description:
      "Only the properties present in the body are changed. Leaving the allowed OAuth domains empty accepts every authenticated Firebase email.",
    response: "Global settings updated",
    type: GlobalSettingsResponseDto,
    validation: true,
  })
  updateGlobalSettings(
    @Body() dto: UpdateGlobalSettingsDto,
  ): Promise<GlobalSettingsResponseDto> {
    return this.settingsService.updateGlobalSettings(dto);
  }
}
