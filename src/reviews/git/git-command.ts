import { HttpStatus } from "@nestjs/common";
import { AppException } from "../../common/app.exception";
import { ErrorCode } from "../../common/error-code.enum";

/**
 * Guards shared by every `git` invocation.
 *
 * The remote URL is rendered from a template an admin writes freely and that is
 * stored in the database (`GitwebUrlRule.remoteTemplate`). Git reads some
 * prefixes as transports that run a command — `ext::sh -c ...` first among them
 * — so without these guards a template is code execution inside the container.
 * Admin is an application role, not a host role: it must not grant a shell.
 */

/** The only transports this service needs. */
const ALLOWED_REMOTE_PROTOCOLS = ["git", "http", "https", "ssh"] as const;

/**
 * `-c` options passed before the subcommand. `protocol.*.allow` is the one that
 * matters: `ext` runs a command, and `file` would read the container's own disk
 * through a template.
 */
export const GIT_HARDENING_ARGS = [
  "-c",
  "protocol.ext.allow=never",
  "-c",
  "protocol.file.allow=never",
  "-c",
  "core.askPass=",
  "-c",
  "core.fsmonitor=false",
  "-c",
  "credential.helper=",
];

/**
 * The minimal environment child processes get.
 *
 * The backend's own environment carries `DATABASE_URL`, `INTERNAL_JWT_SECRET`
 * and the path to the Firebase key. Handing those to git hands them to whatever
 * git runs: useless, and exactly what an `ext::` transport would go read.
 * `GIT_CONFIG_*` neutralises the system and user config files, which could
 * otherwise re-enable a protocol.
 */
export function gitEnvironment(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
    HOME: process.env.HOME ?? "/tmp",
    LANG: "C",
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: "",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_ALLOW_PROTOCOL: ALLOWED_REMOTE_PROTOCOLS.join(":"),
  };
}

/**
 * Refuses a remote URL that git would treat as anything other than a repository
 * reachable over a network transport.
 *
 * `GIT_ALLOW_PROTOCOL` already covers the case, but it fails at run time with a
 * message the user cannot act on. This check fails immediately, and names the
 * template at fault.
 */
export function assertSafeRemoteUrl(remoteUrl: string): void {
  const trimmed = remoteUrl.trim();

  if (!trimmed || trimmed !== remoteUrl) {
    throw invalidRemote(remoteUrl, "it has surrounding whitespace or is empty");
  }

  // An option, not a URL: git would read it as one.
  if (trimmed.startsWith("-")) {
    throw invalidRemote(remoteUrl, "it would be read as a command-line option");
  }

  const scheme = /^([a-z][a-z0-9+.-]*)::/i.exec(trimmed)?.[1];
  if (scheme) {
    throw invalidRemote(
      remoteUrl,
      `"${scheme}::" is a git transport helper, not a URL`,
    );
  }

  const protocol = /^([a-z][a-z0-9+.-]*):\/\//i.exec(trimmed)?.[1]?.toLowerCase();

  // The scp-like shorthand, "user@host:path", which git treats as ssh.
  const isScpLike =
    !protocol && /^[^/:]+@[^/:]+:/.test(trimmed) && !trimmed.includes("://");

  if (!protocol && !isScpLike) {
    throw invalidRemote(remoteUrl, "it has no recognisable protocol");
  }

  if (
    protocol &&
    !ALLOWED_REMOTE_PROTOCOLS.includes(
      protocol as (typeof ALLOWED_REMOTE_PROTOCOLS)[number],
    )
  ) {
    throw invalidRemote(
      remoteUrl,
      `the "${protocol}" protocol is not allowed (allowed: ${ALLOWED_REMOTE_PROTOCOLS.join(", ")})`,
    );
  }
}

function invalidRemote(remoteUrl: string, reason: string): AppException {
  return new AppException(
    ErrorCode.INVALID_GITWEB_URL,
    HttpStatus.BAD_REQUEST,
    `Refusing to use the git remote "${remoteUrl}": ${reason}. Check the remoteTemplate of the matching git-web URL rule.`,
  );
}

/**
 * Restricts which hosts the backend will reach out to.
 *
 * Same spelling as the other allow-lists in the stack: empty or `*` allows every
 * host, a plain entry matches exactly, and a leading dot also covers
 * subdomains. The default stays permissive — company forges often live on
 * private addresses, and refusing them by default would break review creation
 * outright — but an instance open to untrusted users should fill it in.
 */
export function parseAllowedGitHosts(value: string | undefined): string[] {
  const entries =
    value
      ?.split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean) ?? [];

  return entries.some((entry) => entry === "*") ? [] : entries;
}

export function assertGitHostAllowed(
  remoteUrl: string,
  allowedHosts: string[],
): void {
  if (allowedHosts.length === 0) {
    return;
  }

  const host = gitRemoteHost(remoteUrl);
  const allowed = allowedHosts.some(
    (entry) =>
      host === entry ||
      (entry.startsWith(".")
        ? host === entry.slice(1) || host.endsWith(entry)
        : host.endsWith(`.${entry}`)),
  );

  if (!allowed) {
    throw new AppException(
      ErrorCode.INVALID_GITWEB_URL,
      HttpStatus.BAD_REQUEST,
      `Refusing to reach the git host "${host}": it is not in GIT_ALLOWED_HOSTS.`,
    );
  }
}

/** The host of a remote URL, scp-like shorthand included. */
function gitRemoteHost(remoteUrl: string): string {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\/([^/]+)/i.exec(remoteUrl)?.[1];
  const authority = withScheme ?? /^([^/:]+@)?([^/:]+):/.exec(remoteUrl)?.[2] ?? "";
  const withoutUser = authority.includes("@")
    ? authority.slice(authority.lastIndexOf("@") + 1)
    : authority;

  return withoutUser.replace(/:\d+$/, "").toLowerCase();
}

/**
 * Keeps a git call from reporting what it found on the network.
 *
 * The remote URL is derived from what the user submitted, and the error message
 * was handed straight back: git's stderr turned review creation into an
 * internal network probe. The detail goes to the logs, not to the response.
 */
export function isProcessError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { stderr?: unknown; cmd?: unknown; code?: unknown; killed?: unknown };
  return (
    candidate.stderr !== undefined ||
    candidate.cmd !== undefined ||
    candidate.killed !== undefined ||
    typeof candidate.code === "number"
  );
}

/**
 * Caps how many git operations run at once.
 *
 * Every `fetch` reaches out to a host the caller chose, with a long timeout:
 * without a cap, a handful of concurrent requests ties up processes, disk and
 * file descriptors for the whole of it.
 */
export class Semaphore {
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }

    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }
}
