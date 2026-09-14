import { Module, applyDecorators } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { Throttle, ThrottlerModule, seconds } from "@nestjs/throttler";
import { UserAwareThrottlerGuard } from "./user-aware-throttler.guard";

/**
 * Global rate limiting.
 *
 * One throttler is configured rather than several named ones: `@nestjs/throttler`
 * applies *every* declared throttler to *every* route, so a limit meant for two
 * expensive routes would end up imposed on the whole API. Routes that deserve
 * something stricter override the `default` throttler instead.
 */

const DEFAULT_PER_MINUTE = 300;
const AUTH_PER_MINUTE = 10;
const GIT_PER_MINUTE = 20;

/**
 * Read from `process.env` rather than `ConfigService`: decorators are evaluated
 * at import time, before Nest has instantiated anything. In a container the
 * variables come from the environment, so they are already there.
 */
function perMinute(key: string, fallback: number): number {
  const configured = Number(process.env[key]);
  return Number.isInteger(configured) && configured > 0 ? configured : fallback;
}

/**
 * `POST /v1/auth/token` derives an scrypt hash on every call, including for an
 * unknown `clientId` — deliberate against enumeration, but as expensive for the
 * server as for the caller, and the route is public.
 */
export function ThrottleAuth(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    Throttle({
      default: {
        limit: perMinute("THROTTLE_AUTH_PER_MINUTE", AUTH_PER_MINUTE),
        ttl: seconds(60),
      },
    }),
  );
}

/**
 * Routes that trigger a `git fetch` towards a remote host, with a two-minute
 * timeout: a handful of concurrent calls is enough to tie up processes, disk and
 * file descriptors.
 */
export function ThrottleGit(): MethodDecorator & ClassDecorator {
  return applyDecorators(
    Throttle({
      default: {
        limit: perMinute("THROTTLE_GIT_PER_MINUTE", GIT_PER_MINUTE),
        ttl: seconds(60),
      },
    }),
  );
}

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const configured = Number(
          config.get<string>("THROTTLE_DEFAULT_PER_MINUTE"),
        );

        return [
          {
            name: "default",
            ttl: seconds(60),
            // Roomy for normal dashboard use, low enough that a loop shows up.
            limit:
              Number.isInteger(configured) && configured > 0
                ? configured
                : DEFAULT_PER_MINUTE,
          },
        ];
      },
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: UserAwareThrottlerGuard }],
})
export class ThrottlingModule {}
