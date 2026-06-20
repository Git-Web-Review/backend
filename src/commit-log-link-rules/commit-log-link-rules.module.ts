import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CommitLogLinkRulesController } from "./commit-log-link-rules.controller";
import { CommitLogLinkRulesService } from "./commit-log-link-rules.service";

@Module({
  imports: [AuthModule],
  controllers: [CommitLogLinkRulesController],
  providers: [CommitLogLinkRulesService],
})
export class CommitLogLinkRulesModule {}
