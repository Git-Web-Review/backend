import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { AdminModule } from "./admin/admin.module";
import { AuthModule } from "./auth/auth.module";
import { CommitLogLinkRulesModule } from "./commit-log-link-rules/commit-log-link-rules.module";
import { HealthModule } from "./health/health.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { ReviewsModule } from "./reviews/reviews.module";
import { SettingsModule } from "./settings/settings.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== "production"
            ? {
                target: "pino-pretty",
                options: {
                  colorize: true,
                  singleLine: true,
                  ignore: "pid,hostname,req,res,responseTime",
                },
              }
            : undefined,
        level: process.env.NODE_ENV !== "production" ? "debug" : "info",
        customLogLevel: (_req, res, err) => {
          if (err || (res.statusCode && res.statusCode >= 500)) {
            return "error";
          }

          if (res.statusCode && res.statusCode >= 400) {
            return "warn";
          }

          return "info";
        },
        customSuccessMessage: (req, res) => {
          return `${req.method} ${req.url} ${res.statusCode}`;
        },
        customErrorMessage: (req, res) => {
          return `${req.method} ${req.url} ${res.statusCode}`;
        },
        serializers: {
          req: () => undefined,
          res: () => undefined,
        },
      },
    }),
    PrismaModule,
    RedisModule,
    AuthModule,
    CommitLogLinkRulesModule,
    AdminModule,
    UsersModule,
    ReviewsModule,
    SettingsModule,
    NotificationsModule,
    HealthModule,
  ],
})
export class AppModule {}
