import assert from "node:assert/strict";
import test from "node:test";
import { validAccessRequest } from "../worker/auth.ts";

const unconfigured = {};

test("allows unconfigured API requests on local development hosts", async () => {
  for (const origin of ["http://localhost:3000", "http://127.0.0.1:8787", "http://[::1]:8787"]) {
    assert.equal(await validAccessRequest(new Request(`${origin}/api/health`), unconfigured), true, origin);
  }
});

test("rejects unconfigured API requests on public hosts", async () => {
  assert.equal(await validAccessRequest(new Request("https://daymark.example.workers.dev/api/health"), unconfigured), false);
});

test("rejects partially configured Access settings", async () => {
  assert.equal(await validAccessRequest(new Request("http://localhost:3000/api/health"), { ALLOWED_EMAIL: "user@example.com" }), false);
});
