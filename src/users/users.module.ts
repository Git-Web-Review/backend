import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ServiceAccountProfileImagesController } from "./service-account-profile-images.controller";
import { UserProfileImagesController } from "./user-profile-images.controller";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { WebhookTestService } from "./webhook-test.service";
import { WebhookUrlService } from "./webhook-url.service";

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [
    UsersController,
    UserProfileImagesController,
    ServiceAccountProfileImagesController,
  ],
  providers: [UsersService, WebhookUrlService, WebhookTestService],
  exports: [UsersService],
})
export class UsersModule {}
