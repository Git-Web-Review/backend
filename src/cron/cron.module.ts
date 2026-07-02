import { Module } from "@nestjs/common";
import { ReviewsModule } from "../reviews/reviews.module";
import { SettingsModule } from "../settings/settings.module";
import { CronService } from "./cron.service";

@Module({
  imports: [SettingsModule, ReviewsModule],
  providers: [CronService],
})
export class CronModule {}
