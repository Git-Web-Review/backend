import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppLogo, GlobalSettings } from "@prisma/client";
import { AppException } from "../common/app.exception";
import { ErrorCode } from "../common/error-code.enum";
import {
  detectImageFormat,
  SUPPORTED_IMAGE_MIME_TYPES,
} from "../common/image-upload";
import { PrismaService } from "../prisma/prisma.service";
import { appLogoMaxBytesFromValue } from "./app-logo.config";
import { AppLogoRemovalResponseDto } from "./dto/app-logo-removal-response.dto";
import { AppLogoResponseDto } from "./dto/app-logo-response.dto";
import { BrandingResponseDto } from "./dto/branding-response.dto";
import { UpdateGlobalSettingsDto } from "./dto/update-global-settings.dto";
import type { UploadedAppLogoFile } from "./types/uploaded-app-logo-file";

const GLOBAL_SETTINGS_ID = "global";
const APP_LOGO_ID = "global";

const APP_LOGO_SUMMARY_SELECT = {
  mimeType: true,
  sizeBytes: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  getGlobalSettings(): Promise<GlobalSettings> {
    return this.prisma.globalSettings.upsert({
      where: { id: GLOBAL_SETTINGS_ID },
      update: {},
      create: { id: GLOBAL_SETTINGS_ID },
    });
  }

  updateGlobalSettings(dto: UpdateGlobalSettingsDto): Promise<GlobalSettings> {
    const allowedOAuthDomains = dto.allowedOAuthDomains
      ? [
          ...new Set(
            dto.allowedOAuthDomains
              .map((domain) => domain.trim().toLowerCase())
              .filter(Boolean),
          ),
        ]
      : undefined;
    const data = {
      allowedOAuthDomains,
      appName: this.nullIfBlank(dto.appName),
      notificationPurgeEnabled: dto.notificationPurgeEnabled,
      notificationPurgeIntervalMinutes: dto.notificationPurgeIntervalMinutes,
      notificationPurgeAfterDays: dto.notificationPurgeAfterDays,
      reviewAutoCloseEnabled: dto.reviewAutoCloseEnabled,
      reviewAutoCloseIntervalMinutes: dto.reviewAutoCloseIntervalMinutes,
    };

    return this.prisma.globalSettings.upsert({
      where: { id: GLOBAL_SETTINGS_ID },
      update: data,
      create: { id: GLOBAL_SETTINGS_ID, ...data },
    });
  }

  /**
   * Read by every signed-in user, so it exposes only what the top bar needs
   * and never the rest of the admin-only global settings.
   */
  async getBranding(): Promise<BrandingResponseDto> {
    const [settings, logo] = await Promise.all([
      this.prisma.globalSettings.findUnique({
        where: { id: GLOBAL_SETTINGS_ID },
        select: { appName: true },
      }),
      this.prisma.appLogo.findUnique({
        where: { id: APP_LOGO_ID },
        select: APP_LOGO_SUMMARY_SELECT,
      }),
    ]);

    return { appName: settings?.appName ?? null, logo };
  }

  async saveAppLogo(file?: UploadedAppLogoFile): Promise<AppLogoResponseDto> {
    this.assertValidAppLogo(file);
    const format = detectImageFormat(file.buffer)!;
    const logoBytes = this.bytesFromBuffer(file.buffer);
    const data = {
      mimeType: format.mimeType,
      sizeBytes: file.size,
      data: logoBytes,
    };

    return this.prisma.appLogo.upsert({
      where: { id: APP_LOGO_ID },
      update: data,
      create: { id: APP_LOGO_ID, ...data },
      select: APP_LOGO_SUMMARY_SELECT,
    });
  }

  async getAppLogo(): Promise<AppLogo> {
    const logo = await this.prisma.appLogo.findUnique({
      where: { id: APP_LOGO_ID },
    });

    if (!logo) {
      throw new AppException(
        ErrorCode.APP_LOGO_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        "Application logo not found",
      );
    }

    return logo;
  }

  async deleteAppLogo(): Promise<AppLogoRemovalResponseDto> {
    await this.prisma.appLogo.deleteMany({ where: { id: APP_LOGO_ID } });
    return { removed: true };
  }

  private assertValidAppLogo(
    file?: UploadedAppLogoFile,
  ): asserts file is UploadedAppLogoFile {
    if (!file) {
      throw new AppException(
        ErrorCode.INVALID_APP_LOGO,
        HttpStatus.BAD_REQUEST,
        "Application logo file is required",
      );
    }

    // SVG is no longer accepted: it is an active format, and the logo is served
    // straight back by GET /v1/branding/logo.
    if (!detectImageFormat(file.buffer)) {
      throw new AppException(
        ErrorCode.INVALID_APP_LOGO,
        HttpStatus.BAD_REQUEST,
        `Application logo must be one of: ${SUPPORTED_IMAGE_MIME_TYPES.join(", ")}`,
      );
    }

    const maxBytes = this.appLogoMaxBytes();
    if (file.size > maxBytes) {
      throw new AppException(
        ErrorCode.PAYLOAD_TOO_LARGE,
        HttpStatus.PAYLOAD_TOO_LARGE,
        `Application logo must be smaller than ${maxBytes} bytes`,
      );
    }
  }

  private appLogoMaxBytes(): number {
    return appLogoMaxBytesFromValue(
      this.config.get<string>("APP_LOGO_MAX_BYTES"),
    );
  }

  private bytesFromBuffer(buffer: Buffer): Uint8Array<ArrayBuffer> {
    const bytes = new Uint8Array(buffer.byteLength);
    bytes.set(buffer);
    return bytes;
  }

  private nullIfBlank(value?: string | null): string | null | undefined {
    if (value === undefined) {
      return undefined;
    }

    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }
}
