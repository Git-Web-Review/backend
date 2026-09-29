import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProjectOwnersController } from "./project-owners.controller";
import { ProjectOwnersService } from "./project-owners.service";

@Module({
  imports: [AuthModule],
  controllers: [ProjectOwnersController],
  providers: [ProjectOwnersService],
  exports: [ProjectOwnersService],
})
export class ProjectOwnersModule {}
