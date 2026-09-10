import { test } from "node:test";
import assert from "node:assert/strict";
import { authorized } from "../broker/auth.mjs";

test("accepts the exact key", () => {
  assert.equal(authorized("s3cr3t", "s3cr3t"), true);
});

test("rejects a wrong key, a prefix, a non-string, and a missing config", () => {
  assert.equal(authorized("wrong", "s3cr3t"), false);
  assert.equal(authorized("s3cr3", "s3cr3t"), false);
  assert.equal(authorized(undefined, "s3cr3t"), false);
  assert.equal(authorized("s3cr3t", undefined), false);
});
