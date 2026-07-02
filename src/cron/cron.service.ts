import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ReviewsService } from "../reviews/reviews.service";
import { SettingsService } from "../settings/settings.service";

const TICK_INTERVAL_MS = 60_000;

type CronTaskName = "notificationPurge" | "reviewAutoClose";

@Injectable()
export class CronService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CronService.name);
  private readonly lastRuns = new Map<CronTaskName, number>();
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly reviews: ReviewsService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, TICK_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      const settings = await this.settings.getGlobalSettings();

      if (
        settings.notificationPurgeEnabled &&
        this.isDue(
          "notificationPurge",
          settings.notificationPurgeIntervalMinutes,
        )
      ) {
        await this.runTask("notificationPurge", () =>
          this.purgeOldNotifications(settings.notificationPurgeAfterDays),
        );
      }

      if (
        settings.reviewAutoCloseEnabled &&
        this.isDue("reviewAutoClose", settings.reviewAutoCloseIntervalMinutes)
      ) {
        await this.runTask("reviewAutoClose", () =>
          this.reviews.closeAckedReviewsMergedOnMaster(),
        );
      }
    } catch (error) {
      this.logger.error(`Cron tick failed: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }

  private isDue(task: CronTaskName, intervalMinutes: number): boolean {
    const lastRun = this.lastRuns.get(task);
    if (lastRun === undefined) {
      return true;
    }

    return Date.now() - lastRun >= intervalMinutes * 60_000;
  }

  private async runTask(
    task: CronTaskName,
    action: () => Promise<number>,
  ): Promise<void> {
    this.lastRuns.set(task, Date.now());
    try {
      const affected = await action();
      this.logger.log(`Cron task ${task} completed (${affected} affected)`);
    } catch (error) {
      this.logger.error(`Cron task ${task} failed: ${String(error)}`);
    }
  }

  private async purgeOldNotifications(afterDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - afterDays * 24 * 60 * 60 * 1000);
    const { count } = await this.prisma.notification.deleteMany({
      where: { seen: true, createdAt: { lt: cutoff } },
    });

    return count;
  }
}
