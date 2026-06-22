import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { NextFunction, Request, Response } from "express";
import { json, urlencoded } from "express";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { AppExceptionFilter } from "./common/app-exception.filter";

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
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });

  app.useLogger(app.get(Logger));
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

  app.use(json({ limit: "10mb" }));
  app.use(urlencoded({ extended: true, limit: "10mb" }));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle("git-web-review API")
    .setDescription("Backend API for git-web-review")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api", app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const frontendOrigin = process.env.FRONTEND_ORIGIN;
  app.enableCors({
    origin: frontendOrigin ? frontendOrigin.split(",") : true,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
