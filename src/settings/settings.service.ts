import { Injectable } from "@nestjs/common";
import type { GlobalSettings } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateGlobalSettingsDto } from "./dto/update-global-settings.dto";

const GLOBAL_SETTINGS_ID = "global";

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

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
}
