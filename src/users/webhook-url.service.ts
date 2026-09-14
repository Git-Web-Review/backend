import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { AppException } from "../common/app.exception";
import { ErrorCode } from "../common/error-code.enum";

/** Past this, we let it through and the relay decides at delivery time. */
const DNS_TIMEOUT_MS = 2000;

/**
 * Applies, when the user saves their webhook URL, the same rules the
 * `http-relay` will apply at delivery time.
 *
 * This check is here for ergonomics and defence in depth, not as the barrier:
 * DNS can change between saving and sending. The authoritative check stays in
 * the relay, which inspects the address actually dialled after resolution.
 * Without this service an internal URL was accepted without complaint and then
 * silently dropped by the relay, leaving the user no way to understand why
 * nothing ever arrived.
 */
@Injectable()
export class WebhookUrlService {
  private readonly logger = new Logger(WebhookUrlService.name);
  private readonly allowedHosts: string[];
  private readonly blockPrivateNetworks: boolean;

  constructor(config: ConfigService) {
    this.allowedHosts = parseAllowedHosts(
      config.get<string>("WEBHOOK_ALLOWED_HOSTS"),
    );
    this.blockPrivateNetworks = parseBoolean(
      config.get<string>("WEBHOOK_BLOCK_PRIVATE_NETWORKS"),
      true,
    );
  }

  async assertAllowed(rawUrl: string): Promise<void> {
    const url = this.parseUrl(rawUrl);
    const hostname = stripBrackets(url.hostname);

    if (!hostname) {
      this.reject("Webhook URL has no host");
    }

    if (
      this.allowedHosts.length > 0 &&
      !hostAllowed(hostname, this.allowedHosts)
    ) {
      this.reject(
        `Webhook host "${hostname}" is not allowed. Allowed hosts: ${this.allowedHosts.join(", ")}.`,
      );
    }

    if (!this.blockPrivateNetworks) {
      return;
    }

    for (const address of await this.addressesFor(hostname)) {
      if (isPrivateAddress(address)) {
        this.reject(
          `Webhook host "${hostname}" resolves to the private address ${address}, which this instance refuses to call. Use a publicly reachable endpoint, or set WEBHOOK_BLOCK_PRIVATE_NETWORKS=false if internal endpoints are intended.`,
        );
      }
    }
  }

  private parseUrl(rawUrl: string): URL {
    let url: URL;
    try {
      url = new URL(rawUrl.trim());
    } catch {
      this.reject("Webhook URL is not a valid URL");
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      this.reject("Webhook URL must be an http(s) URL");
    }

    return url;
  }

  /**
   * The addresses behind a hostname. A resolution that fails is not treated as
   * a refusal: DNS may be briefly unavailable, or the record may only exist for
   * the relay. The relay will refuse on its own side if the address really is
   * private.
   */
  private async addressesFor(hostname: string): Promise<string[]> {
    if (isIP(hostname)) {
      return [hostname];
    }

    try {
      const resolved = await withTimeout(
        lookup(hostname, { all: true, verbatim: true }),
        DNS_TIMEOUT_MS,
      );

      return resolved.map((entry) => entry.address);
    } catch (error) {
      this.logger.debug(
        `Could not resolve webhook host "${hostname}": ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
      return [];
    }
  }

  private reject(message: string): never {
    throw new AppException(
      ErrorCode.WEBHOOK_URL_NOT_ALLOWED,
      HttpStatus.BAD_REQUEST,
      message,
    );
  }
}

/**
 * Same spelling as the relay's `WEBHOOK_ALLOWED_HOSTS` and as the other host
 * lists in the stack: empty or `*` allows everything, and a `*.` prefix is
 * accepted then dropped.
 */
function parseAllowedHosts(value: string | undefined): string[] {
  const entries =
    value
      ?.split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean) ?? [];

  if (entries.some((entry) => entry === "*")) {
    return [];
  }

  return entries.map((entry) =>
    entry.startsWith("*.") ? entry.slice(2) : entry,
  );
}

/** A listed host also covers its subdomains, like `hostAllowed` in Go. */
function hostAllowed(hostname: string, allowedHosts: string[]): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");

  return allowedHosts.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(normalized);
}

function stripBrackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

/**
 * Mirrors the relay's `isPrivateAddress`: loopback, private ranges, link-local,
 * unspecified, multicast, and the carrier-grade NAT range 100.64.0.0/10 that
 * most libraries forget.
 */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    return isPrivateIpv4(address);
  }
  if (version === 6) {
    return isPrivateIpv6(address);
  }

  // Neither IPv4 nor IPv6: we do not know what it is, so we do not call it.
  return true;
}

function isPrivateIpv4(address: string): boolean {
  const [a, b] = address.split(".").map(Number);

  if (a === 0) return true; // 0.0.0.0/8, the unspecified address included
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10, CGNAT
  if (a >= 224) return true; // multicast, reserved, broadcast

  return false;
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0];

  if (normalized === "::" || normalized === "::1") {
    return true;
  }

  // Embedded IPv4: ::ffff:127.0.0.1 really does reach 127.0.0.1.
  const embedded = /^::(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/.exec(normalized);
  if (embedded) {
    return isPrivateIpv4(embedded[1]);
  }

  const head = Number.parseInt(normalized.split(":")[0] || "0", 16);
  if (Number.isNaN(head)) {
    return true;
  }

  if ((head & 0xfe00) === 0xfc00) return true; // fc00::/7, unique local
  if ((head & 0xffc0) === 0xfe80) return true; // fe80::/10, link-local
  if ((head & 0xff00) === 0xff00) return true; // ff00::/8, multicast

  return false;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );

    promise
      .then(resolve, reject)
      .finally(() => clearTimeout(timer));
  });
}
