import assert from "node:assert/strict";
import { test } from "node:test";
import { commitToReopen } from "./commit-reopening.ts";

const commit = (hash: string, status: string, acks: unknown[] = []) => ({
  hash,
  status,
  acks,
});

test("a message on a reviewed commit reopens it", () => {
  const reviewed = commit("abc", "REVIEWED");
  assert.equal(
    commitToReopen([commit("def", "PENDING"), reviewed], "abc"),
    reviewed,
  );
});

test("a commit not marked reviewed is left as is", () => {
  assert.equal(commitToReopen([commit("abc", "IN_REVIEW")], "abc"), undefined);
  assert.equal(commitToReopen([commit("abc", "PENDING")], "abc"), undefined);
});

test("an acked commit stays acked", () => {
  assert.equal(
    commitToReopen([commit("abc", "ACKED", [{ userId: "alice" }])], "abc"),
    undefined,
  );
});

test("a review-level message reopens no commit", () => {
  assert.equal(commitToReopen([commit("abc", "REVIEWED")], null), undefined);
});

test("a message on another commit leaves the reviewed one alone", () => {
  assert.equal(commitToReopen([commit("abc", "REVIEWED")], "def"), undefined);
});
