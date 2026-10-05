import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyCredentials, isValidSession, createSessionToken } from "../lib/auth";

test("verifyCredentials accepts valid demo credentials", () => {
  assert.equal(verifyCredentials("demo@cloaflow.local", "demo123"), true);
  assert.equal(verifyCredentials("DEMO@CLOAFLOW.LOCAL", "demo123"), true);
});

test("verifyCredentials rejects invalid credentials", () => {
  assert.equal(verifyCredentials("demo@cloaflow.local", "wrongpassword"), false);
  assert.equal(verifyCredentials("unknown@domain.com", "demo123"), false);
  assert.equal(verifyCredentials(null, null), false);
});

test("createSessionToken and isValidSession validate session tokens", () => {
  const token = createSessionToken("demo@cloaflow.local");
  assert.ok(token);
  assert.equal(isValidSession(token), true);
  assert.equal(isValidSession("invalid-token-xyz"), false);
});
