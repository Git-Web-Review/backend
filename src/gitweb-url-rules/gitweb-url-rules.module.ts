import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { GitwebUrlRulesController } from "./gitweb-url-rules.controller";
import { GitwebUrlRulesService } from "./gitweb-url-rules.service";

@Module({
  imports: [AuthModule],
  controllers: [GitwebUrlRulesController],
  providers: [GitwebUrlRulesService],
  exports: [GitwebUrlRulesService],
})
export class GitwebUrlRulesModule {}
