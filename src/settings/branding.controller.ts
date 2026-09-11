import { Get, Header, Res, StreamableFile } from "@nestjs/common";
import { Response } from "express";
import { ApiAuthenticatedController } from "../auth/api-controller.decorators";
import { ApiEndpoint, ApiTag, IMAGE_CONTENT } from "../common/swagger";
import { BrandingResponseDto } from "./dto/branding-response.dto";
import { SettingsService } from "./settings.service";

/**
 * Read-only view of the customer branding shown in the top bar. Admins own it
 * through `v1/admin/settings`; every signed-in user needs to read it, so these
 * routes only require authentication.
 */
@ApiAuthenticatedController(ApiTag.Settings, "v1/branding")
export class BrandingController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiEndpoint({
    summary: "Get the application branding",
    description:
      "A blank application name means the caller should fall back to `git-web-review`.",
    response: "Branding returned",
    type: BrandingResponseDto,
  })
  getBranding(): Promise<BrandingResponseDto> {
    return this.settingsService.getBranding();
  }

  @Get("logo")
  @ApiEndpoint({
    summary: "Get the application logo",
    response:
      "Raw logo bytes, served with the stored `Content-Type`. Not JSON.",
    content: IMAGE_CONTENT,
    notFound: true,
  })
  @Header("Cache-Control", "private, max-age=300")
  async getAppLogo(
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const logo = await this.settingsService.getAppLogo();
    response.setHeader("Content-Type", logo.mimeType);
    response.setHeader("Content-Length", logo.sizeBytes.toString());

    return new StreamableFile(logo.data);
  }
}
