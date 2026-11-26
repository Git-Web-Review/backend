import assert from "node:assert/strict";
import { execFile, execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { runInRepo } from "./git-repo-lock.ts";

const execFileAsync = promisify(execFile);

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: "pipe",
  }).trim();

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer().listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

test("parallel shallow fetches into one cache do not race", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "gwr-cache-lock-"));
  const source = join(root, "served", "repo.git");
  const work = join(root, "work");
  execFileSync("git", ["init", "-q", "-b", "main", work]);
  const hashes: string[] = [];
  for (let index = 0; index < 12; index += 1) {
    git(work, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", `c${index}`);
    hashes.push(git(work, "rev-parse", "HEAD"));
  }
  execFileSync("git", ["clone", "-q", "--bare", work, source]);
  git(source, "config", "uploadpack.allowAnySHA1InWant", "true");

  const port = await freePort();
  const daemon = spawn("git", [
    "daemon", "--export-all", "--reuseaddr", "--listen=127.0.0.1", `--port=${port}`,
    `--base-path=${join(root, "served")}`, join(root, "served"),
  ]);
  t.after(() => {
    daemon.kill();
    rmSync(root, { recursive: true, force: true });
  });
  const remoteUrl = `git://127.0.0.1:${port}/repo.git`;
  for (let attempt = 0; ; attempt += 1) {
    try {
      execFileSync("git", ["ls-remote", remoteUrl], { stdio: "pipe" });
      break;
    } catch (error) {
      if (attempt > 50) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  // What a sync does: a shallow fetch of the commit into the shared cache.
  const cache = join(root, "cache.git");
  execFileSync("git", ["init", "-q", "--bare", cache]);
  const fetched = await Promise.all(
    hashes.map((hash) =>
      runInRepo(cache, async () => {
        await execFileAsync("git", ["-C", cache, "fetch", "-q", "--depth=2", remoteUrl, hash]);
        return git(cache, "rev-parse", "FETCH_HEAD");
      }),
    ),
  );
  assert.deepEqual(fetched, hashes);
});

test("a shallow race is retried once, other errors are not", async () => {
  const shallowRace = Object.assign(new Error("fetch failed"), {
    stderr: "fatal: shallow file has changed since we read it",
  });
  let calls = 0;
  assert.equal(
    await runInRepo("/retry", async () => {
      calls += 1;
      if (calls === 1) throw shallowRace;
      return "ok";
    }),
    "ok",
  );
  assert.equal(calls, 2);

  calls = 0;
  await assert.rejects(
    runInRepo("/other", async () => {
      calls += 1;
      throw new Error("fatal: not found");
    }),
  );
  assert.equal(calls, 1);
});
