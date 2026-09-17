import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  assertSafeRemoteUrl,
  gitEnvironment,
  GIT_HARDENING_ARGS,
  Semaphore,
} from "./git-command";

const execFileAsync = promisify(execFile);

/** Concurrent git operations, all callers together. */
const gitConcurrency = new Semaphore(
  Math.max(1, Number(process.env.GIT_MAX_CONCURRENT ?? 4) || 4),
);

const gitTimeoutMs = Math.max(
  5_000,
  Number(process.env.GIT_TIMEOUT_MS ?? 120_000) || 120_000,
);

const gitCacheDirectory =
  process.env.GIT_WEB_REVIEW_GIT_CACHE_DIR ?? "/tmp/git-web-review/repos";

export function runGit(args: string[]): Promise<string> {
  return gitConcurrency.run(async () => {
    const { stdout } = await execFileAsync(
      "git",
      [...GIT_HARDENING_ARGS, ...args],
      {
        encoding: "utf8",
        env: gitEnvironment(),
        maxBuffer: 50 * 1024 * 1024,
        timeout: gitTimeoutMs,
      },
    );

    return stdout;
  });
}

export function runGitPiped(
  firstArgs: string[],
  secondArgs: string[],
  stdin: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = gitEnvironment();
    const first = spawn("git", [...GIT_HARDENING_ARGS, ...firstArgs], { env });
    const second = spawn("git", [...GIT_HARDENING_ARGS, ...secondArgs], { env });
    let stdout = "";
    let stderr = "";
    second.stdout.setEncoding("utf8");
    second.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    second.stderr.setEncoding("utf8");
    second.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    first.stdout.pipe(second.stdin);
    first.stderr.on("data", () => {});
    first.on("error", reject);
    second.on("error", reject);
    second.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr.trim() || `git pipeline failed (${code})`));
      }
    });
    first.stdin.end(stdin);
  });
}

export function gitPatchId(patch: string): Promise<string | null> {
  const input = patch.trim();
  if (!input) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const child = spawn("git", [...GIT_HARDENING_ARGS, "patch-id", "--stable"], {
      env: gitEnvironment(),
    });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.on("error", () => resolve(null));
    child.on("close", () => {
      resolve(stdout.trim().split(/\s+/)[0] || null);
    });
    child.stdin.on("error", () => {});
    child.stdin.end(`${input}\n`);
  });
}

export async function ensureGitCache(remoteUrl: string): Promise<string> {
  assertSafeRemoteUrl(remoteUrl);

  const repoKey = createHash("sha256").update(remoteUrl).digest("hex");
  const repoPath = join(gitCacheDirectory, `${repoKey}.git`);

  await mkdir(gitCacheDirectory, { recursive: true });
  try {
    await runGit(["-C", repoPath, "rev-parse", "--is-bare-repository"]);
  } catch {
    await runGit(["init", "--bare", repoPath]);
  }

  return repoPath;
}
