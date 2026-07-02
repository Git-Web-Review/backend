import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ReviewFieldsController } from "./review-fields.controller";
import { ReviewFieldsService } from "./review-fields.service";

@Module({
  imports: [AuthModule],
  controllers: [ReviewFieldsController],
  providers: [ReviewFieldsService],
})
export class ReviewFieldsModule {}
