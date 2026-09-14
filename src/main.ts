import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import { json, urlencoded } from "express";
import helmet from "helmet";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { AppExceptionFilter } from "./common/app-exception.filter";
import { setupSwagger } from "./common/swagger/swagger.setup";

function parseAllowedHosts(value: string | undefined): true | string[] | undefined {
  const hosts = value
    ?.split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  if (!hosts?.length) {
    return undefined;
  }

  if (hosts.some((host) => host === "*" || host === "true")) {
    return true;
  }

  return hosts;
}

function stripPort(host: string): string {
  if (host.startsWith("[")) {
    const ipv6End = host.indexOf("]");
    return ipv6End === -1 ? host : host.slice(1, ipv6End);
  }

  return host.split(":")[0] ?? host;
}

function isHostAllowed(requestHost: string, allowedHosts: string[]): boolean {
  const normalizedHost = requestHost.trim().toLowerCase();
  const hostname = stripPort(normalizedHost);

  return allowedHosts.some((allowedHost) => {
    if (allowedHost === normalizedHost || allowedHost === hostname) {
      return true;
    }

    if (allowedHost.startsWith(".")) {
      const suffix = allowedHost.slice(1);
      return hostname === suffix || hostname.endsWith(allowedHost);
    }

    return false;
  });
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });

  const logger = app.get(Logger);
  app.useLogger(logger);
  app.useGlobalFilters(new AppExceptionFilter());

  const allowedHosts = parseAllowedHosts(process.env.BACKEND_ALLOWED_HOSTS);
  if (Array.isArray(allowedHosts)) {
    app.use((request: Request, response: Response, next: NextFunction) => {
      const host = request.headers.host;

      if (!host || !isHostAllowed(host, allowedHosts)) {
        response.status(403).json({ message: "Host is not allowed" });
        return;
      }

      next();
    });
  }

  // Behind a reverse proxy, `request.ip` is the proxy's address and the rate
  // limit counts everyone together. Only enable it when a trusted proxy really
  // rewrites X-Forwarded-For: otherwise anyone picks their own address, and so
  // their own counter.
  const trustProxy = process.env.TRUST_PROXY?.trim();
  if (trustProxy && trustProxy !== "false") {
    const hops = Number(trustProxy);
    app.set("trust proxy", Number.isInteger(hops) && hops > 0 ? hops : trustProxy);
  }

  // CSP disabled globally: the API returns JSON, and Swagger UI needs inline
  // scripts and styles. The few routes that return user-supplied bytes set their
  // own, far stricter policy.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );

  app.use(json({ limit: "10mb" }));
  app.use(urlencoded({ extended: true, limit: "10mb" }));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // The documentation publishes the whole API surface: routes, DTOs, role
  // semantics. Useful in development, pointless to hand out in production.
  const swaggerEnabled =
    process.env.SWAGGER_ENABLED?.trim().toLowerCase() === "true" ||
    process.env.NODE_ENV !== "production";
  if (swaggerEnabled) {
    setupSwagger(app);
  } else {
    logger.log("Swagger is disabled (set SWAGGER_ENABLED=true to serve it)");
  }

  // An empty origin fell back to `true`, which reflects the caller's origin and
  // so allows every site. The impact stays limited — the API authenticates with
  // a token, not a cookie — but it is a layer lost for no reason, and
  // docker-compose always supplies a value.
  const frontendOrigin = process.env.FRONTEND_ORIGIN?.trim();
  if (!frontendOrigin) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "FRONTEND_ORIGIN is required in production: refusing to accept requests from every origin",
      );
    }

    logger.warn(
      "FRONTEND_ORIGIN is not set, accepting every origin. Never do this outside development.",
    );
  }

  app.enableCors({
    origin: frontendOrigin ? frontendOrigin.split(",") : true,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
