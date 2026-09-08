import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { UserProfileImagesController } from "./user-profile-images.controller";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [AuthModule],
  controllers: [UsersController, UserProfileImagesController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
