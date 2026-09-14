import { Injectable, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly publisher: Redis;

  constructor() {
    // The password is passed as an option rather than inside the URL: a
    // base64-generated password contains `/`, `+` and `=`, which make the URL
    // invalid or silently truncate the value.
    this.publisher = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      password: process.env.REDIS_PASSWORD || undefined,
    });
  }

  async publish(channel: string, data: unknown): Promise<void> {
    await this.publisher.publish(channel, JSON.stringify(data));
  }

  async setNx(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.publisher.set(key, "1", "EX", ttlSeconds, "NX");
    return result === "OK";
  }

  onModuleDestroy() {
    this.publisher.disconnect();
  }
}
