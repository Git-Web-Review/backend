import { HttpStatus, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { lookup, type LookupAddress } from "node:dns";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";
import { AppException } from "../common/app.exception";
import { ErrorCode } from "../common/error-code.enum";
import { WebhookUrlService, isPrivateAddress } from "./webhook-url.service";

const TIMEOUT_MS = 5000;

export type WebhookTestUser = {
  id: string;
  email: string;
  nickname: string | null;
  locale: string | null;
};

/**
 * Sends a TEST event to a webhook URL, in the shape the `http-relay` delivers,
 * so an endpoint that does not answer 2xx is caught when it is set up rather
 * than when notifications start disappearing.
 */
@Injectable()
export class WebhookTestService {
  constructor(private readonly webhookUrls: WebhookUrlService) {}

  async assertReachable(rawUrl: string, user: WebhookTestUser): Promise<void> {
    await this.webhookUrls.assertAllowed(rawUrl);

    const now = new Date().toISOString();
    const body = JSON.stringify({
      app: "git-web-review",
      event: "TEST",
      notificationId: "",
      deliveryId: randomUUID(),
      createdAt: now,
      sentAt: now,
      url: "",
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname ?? "",
        locale: user.locale ?? "",
      },
      payload: { message: "Webhook test from git-web-review" },
    });

    const status = await this.post(new URL(rawUrl.trim()), body).catch(
      (error: Error) =>
        this.fail(`Webhook endpoint unreachable: ${error.message}`),
    );
    if (status < 200 || status >= 300) {
      this.fail(`Webhook endpoint answered HTTP ${status}, expected a 2xx`);
    }
  }

  /** The status code; redirects are not followed, like in the relay. */
  private post(url: URL, body: string): Promise<number> {
    const request = url.protocol === "https:" ? httpsRequest : httpRequest;

    return new Promise((resolve, reject) => {
      const outgoing = request(
        url,
        {
          method: "POST",
          timeout: TIMEOUT_MS,
          lookup: this.webhookUrls.blockPrivateNetworks
            ? publicOnlyLookup
            : undefined,
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
            "User-Agent": "git-web-review-backend",
            "X-Git-Web-Review-Event": "TEST",
          },
        },
        (response) => {
          response.resume();
          resolve(response.statusCode ?? 0);
        },
      );
      outgoing.on("timeout", () =>
        outgoing.destroy(new Error(`no answer within ${TIMEOUT_MS / 1000}s`)),
      );
      outgoing.on("error", reject);
      outgoing.end(body);
    });
  }

  private fail(message: string): never {
    throw new AppException(
      ErrorCode.WEBHOOK_TEST_FAILED,
      HttpStatus.BAD_REQUEST,
      message,
    );
  }
}

/**
 * Checks the address about to be dialled, after resolution, as the relay's
 * dialer does: `assertAllowed` resolved the name earlier, and DNS may answer
 * differently now.
 */
const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) {
      callback(error, "", 0);
      return;
    }

    const list = addresses as LookupAddress[];
    const blocked = list.find((entry) => isPrivateAddress(entry.address));
    if (blocked) {
      callback(
        new Error(`refusing to reach private address ${blocked.address}`),
        "",
        0,
      );
      return;
    }

    if (options.all) {
      callback(null, list);
    } else {
      callback(null, list[0].address, list[0].family);
    }
  });
};
