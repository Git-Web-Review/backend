import {
  Body,
  Delete,
  Get,
  Patch,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiAdminController } from "../auth/api-controller.decorators";
import { ApiEndpoint, ApiImageUpload, ApiTag } from "../common/swagger";
import { appLogoMaxBytesFromValue } from "./app-logo.config";
import { AppLogoRemovalResponseDto } from "./dto/app-logo-removal-response.dto";
import { AppLogoResponseDto } from "./dto/app-logo-response.dto";
import { GlobalSettingsResponseDto } from "./dto/global-settings-response.dto";
import { UpdateGlobalSettingsDto } from "./dto/update-global-settings.dto";
import { SettingsService } from "./settings.service";
import type { UploadedAppLogoFile } from "./types/uploaded-app-logo-file";

@ApiAdminController(ApiTag.Settings, "v1/admin/settings")
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiEndpoint({
    summary: "Get global settings",
    description:
      "Instance-wide configuration: allowed OAuth domains, branding and notification defaults.",
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

  @Patch("logo")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: appLogoMaxBytesFromValue(process.env.APP_LOGO_MAX_BYTES),
      },
    }),
  )
  @ApiImageUpload()
  @ApiEndpoint({
    summary: "Upload the application logo",
    description:
      "Replaces the current logo. Read it back from `GET /v1/branding/logo`.",
    response: "Application logo saved",
    type: AppLogoResponseDto,
    validation: true,
  })
  saveAppLogo(
    @UploadedFile() file?: UploadedAppLogoFile,
  ): Promise<AppLogoResponseDto> {
    return this.settingsService.saveAppLogo(file);
  }

  @Delete("logo")
  @ApiEndpoint({
    summary: "Remove the application logo",
    description: "The top bar then falls back to the application name alone.",
    response: "Application logo removed",
    type: AppLogoRemovalResponseDto,
  })
  deleteAppLogo(): Promise<AppLogoRemovalResponseDto> {
    return this.settingsService.deleteAppLogo();
  }
}
