import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { GitwebUrlRulesModule } from "../gitweb-url-rules/gitweb-url-rules.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ProjectDefaultReviewersModule } from "../project-default-reviewers/project-default-reviewers.module";
import { GitwebMetadataService } from "./gitweb/gitweb-metadata.service";
import { ReviewClosingService } from "./review-closing.service";
import { ReviewCommentsService } from "./review-comments.service";
import { ReviewFieldValuesService } from "./review-field-values.service";
import { ReviewNotificationsService } from "./review-notifications.service";
import { ReviewProgressService } from "./review-progress.service";
import { ReviewResponsesService } from "./review-responses.service";
import { ReviewReviewersService } from "./review-reviewers.service";
import { ReviewStatusService } from "./review-status.service";
import { ReviewsController } from "./reviews.controller";
import { ReviewsService } from "./reviews.service";
import { ReviewSyncService } from "./sync/review-sync.service";
import { SyncBranchResolverService } from "./sync/sync-branch-resolver.service";
import { SyncPlannerService } from "./sync/sync-planner.service";

@Module({
  imports: [
    AuthModule,
    GitwebUrlRulesModule,
    NotificationsModule,
    ProjectDefaultReviewersModule,
  ],
  controllers: [ReviewsController],
  providers: [
    ReviewsService,
    ReviewCommentsService,
    ReviewProgressService,
    ReviewClosingService,
    ReviewSyncService,
    ReviewFieldValuesService,
    ReviewReviewersService,
    ReviewResponsesService,
    ReviewStatusService,
    ReviewNotificationsService,
    GitwebMetadataService,
    SyncPlannerService,
    SyncBranchResolverService,
  ],
  exports: [ReviewClosingService],
})
export class ReviewsModule {}
