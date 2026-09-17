import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProjectDefaultReviewersController } from "./project-default-reviewers.controller";
import { ProjectDefaultReviewersService } from "./project-default-reviewers.service";

@Module({
  imports: [AuthModule],
  controllers: [ProjectDefaultReviewersController],
  providers: [ProjectDefaultReviewersService],
  exports: [ProjectDefaultReviewersService],
})
export class ProjectDefaultReviewersModule {}
