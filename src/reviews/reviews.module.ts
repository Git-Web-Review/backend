import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { GitwebUrlRulesModule } from "../gitweb-url-rules/gitweb-url-rules.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ProjectDefaultReviewersModule } from "../project-default-reviewers/project-default-reviewers.module";
import { ReviewsController } from "./reviews.controller";
import { ReviewsService } from "./reviews.service";

@Module({
  imports: [
    AuthModule,
    GitwebUrlRulesModule,
    NotificationsModule,
    ProjectDefaultReviewersModule,
  ],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
