import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as admin from "firebase-admin";
import { existsSync, readFileSync } from "fs";

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private app?: admin.app.App;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    if (admin.apps.length === 0) {
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
      this.app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } else {
      this.app = admin.apps[0]!;
    }
  }

  get auth(): admin.auth.Auth {
    if (!this.app) {
      throw new Error("Firebase is not configured");
    }

    return this.app.auth();
  }

  async verifyToken(token: string): Promise<admin.auth.DecodedIdToken> {
    return this.auth.verifyIdToken(token);
  }
}
