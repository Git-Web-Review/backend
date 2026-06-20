import { Injectable, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly publisher: Redis;

  constructor() {
    this.publisher = new Redis(
      process.env.REDIS_URL || "redis://localhost:6379",
    );
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
