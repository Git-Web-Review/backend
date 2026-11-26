import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { defaultBranchFromSymref, UPSTREAM_REFS } from "./remote-refs.ts";

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: "pipe",
  }).trim();

test("a repository without master: HEAD branch and origin/HEAD upstream", (t) => {
  const root = mkdtempSync(join(tmpdir(), "gwr-no-master-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const remote = join(root, "remote");
  const cache = join(root, "cache");
  const commit = (message: string) =>
    git(
      remote,
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@t",
      "commit",
      "--allow-empty",
      "-q",
      "-m",
      message,
    );

  execFileSync("git", ["init", "-q", "-b", "b_6wind-2.0.1", remote]);
  commit("upstream");
  git(remote, "update-ref", "refs/remotes/origin/b_6wind-2.0.1", "HEAD");
  git(
    remote,
    "symbolic-ref",
    "refs/remotes/origin/HEAD",
    "refs/remotes/origin/b_6wind-2.0.1",
  );
  commit("ahead");
  execFileSync("git", ["init", "-q", "--bare", cache]);

  const branch = defaultBranchFromSymref(
    git(cache, "ls-remote", "--symref", remote, "HEAD"),
  );
  assert.equal(branch, "b_6wind-2.0.1");

  git(cache, "fetch", "-q", remote, `+${branch}:refs/gwr/head`);
  const upstream = UPSTREAM_REFS.find((ref) => {
    try {
      git(cache, "fetch", "-q", remote, `+${ref}:refs/gwr/origin`);
      return true;
    } catch {
      return false;
    }
  });
  assert.equal(upstream, "refs/remotes/origin/HEAD");
  assert.equal(
    git(cache, "log", "--format=%s", "refs/gwr/origin..refs/gwr/head"),
    "ahead",
  );
});

test("no symref in the ls-remote output: no default branch", () => {
  assert.equal(defaultBranchFromSymref("abc123\tHEAD\n"), null);
});

test("a repository without remote-tracking refs: compared to its own master", (t) => {
  const root = mkdtempSync(join(tmpdir(), "gwr-plain-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const remote = join(root, "remote");
  const cache = join(root, "cache");
  const commit = (message: string) =>
    git(
      remote,
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@t",
      "commit",
      "--allow-empty",
      "-q",
      "-m",
      message,
    );

  execFileSync("git", ["init", "-q", "-b", "master", remote]);
  commit("base");
  git(remote, "checkout", "-q", "-b", "feature");
  commit("ahead");
  git(remote, "checkout", "-q", "master");
  commit("master moved on");
  execFileSync("git", ["init", "-q", "--bare", cache]);

  git(cache, "fetch", "-q", remote, "+feature:refs/gwr/head");
  const upstream = UPSTREAM_REFS.find((ref) => {
    try {
      git(cache, "fetch", "-q", remote, `+${ref}:refs/gwr/origin`);
      return true;
    } catch {
      return false;
    }
  });
  assert.equal(upstream, "refs/heads/master");
  assert.equal(
    git(cache, "log", "--format=%s", "refs/gwr/origin..refs/gwr/head"),
    "ahead",
  );
});
