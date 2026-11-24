import assert from "node:assert/strict";
import { test } from "node:test";
import { syncedReviewTitle } from "./review-text.ts";

test("a generated title follows the new branch", () => {
  const current = { title: "old", sourceBranch: "old", commitTitles: [] };
  assert.equal(syncedReviewTitle(current, "new", []), "new");
});

test("a generated title follows the new first commit on master", () => {
  const current = {
    title: "fix a",
    sourceBranch: "master",
    commitTitles: ["fix a"],
  };
  assert.equal(syncedReviewTitle(current, "master", ["fix b"]), "fix b");
});

test("a title edited by hand is kept", () => {
  const current = { title: "custom", sourceBranch: "old", commitTitles: [] };
  assert.equal(syncedReviewTitle(current, "new", []), "custom");
});
