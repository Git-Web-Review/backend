import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth, type DecodedIdToken } from "firebase-admin/auth";
import { existsSync, readFileSync } from "fs";

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private app?: App;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    const [existingApp] = getApps();
    if (!existingApp) {
      const credsPath = this.config.get<string>(
        "GOOGLE_APPLICATION_CREDENTIALS",
      );
      if (!credsPath) {
        this.logger.warn("GOOGLE_APPLICATION_CREDENTIALS is not configured");
        return;
      }

      if (!existsSync(credsPath)) {
        this.logger.warn(
          `Firebase service account file not found at ${credsPath}`,
        );
        return;
      }

      const serviceAccount = JSON.parse(readFileSync(credsPath, "utf-8"));
      this.app = initializeApp({
        credential: cert(serviceAccount),
      });
    } else {
      this.app = existingApp;
    }
  }

  get auth(): Auth {
    if (!this.app) {
      throw new Error("Firebase is not configured");
    }

    return getAuth(this.app);
  }

  async verifyToken(token: string): Promise<DecodedIdToken> {
    return this.auth.verifyIdToken(token);
  }
}
