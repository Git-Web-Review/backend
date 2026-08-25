import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { GitwebUrlRulesModule } from "../gitweb-url-rules/gitweb-url-rules.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ReviewsController } from "./reviews.controller";
import { ReviewsService } from "./reviews.service";

@Module({
  imports: [AuthModule, GitwebUrlRulesModule, NotificationsModule],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
