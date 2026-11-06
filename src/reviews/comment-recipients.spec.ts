import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewRecipients } from "./comment-recipients.ts";

const asObject = (recipients: Map<string, string>) =>
  Object.fromEntries(recipients);

test("owner commenting notifies every reviewer, not the owner", () => {
  const recipients = reviewRecipients({
    ownerId: "owner",
    reviewerIds: ["alice", "bot"],
    threadAuthorIds: ["owner"],
    actorId: "owner",
  });
  assert.deepEqual(asObject(recipients), {
    alice: "reviewer",
    bot: "reviewer",
  });
});

test("reviewer replying notifies the owner and the other participants", () => {
  const recipients = reviewRecipients({
    ownerId: "owner",
    reviewerIds: ["alice", "bob"],
    threadAuthorIds: ["owner", "carol", "alice"],
    actorId: "alice",
  });
  assert.deepEqual(asObject(recipients), {
    owner: "owner",
    bob: "reviewer",
    carol: "participant",
  });
});

test("the author is never notified, whatever their roles", () => {
  const recipients = reviewRecipients({
    ownerId: "alice",
    reviewerIds: ["alice", "bob"],
    threadAuthorIds: ["alice", "alice"],
    actorId: "alice",
  });
  assert.equal(recipients.has("alice"), false);
  assert.deepEqual([...recipients.keys()], ["bob"]);
});

test("one entry per user, the strongest role wins", () => {
  const recipients = reviewRecipients({
    ownerId: "owner",
    reviewerIds: ["owner", "bob", "bob"],
    threadAuthorIds: ["bob", "owner"],
    actorId: "someone",
  });
  assert.deepEqual(asObject(recipients), { owner: "owner", bob: "reviewer" });
});

test("mentioned users are left out: they get COMMENT_MENTION instead", () => {
  const recipients = reviewRecipients({
    ownerId: "owner",
    reviewerIds: ["bob", "carol"],
    threadAuthorIds: ["dave"],
    actorId: "carol",
    excludedIds: ["owner", "dave"],
  });
  assert.deepEqual(asObject(recipients), { bob: "reviewer" });
});
