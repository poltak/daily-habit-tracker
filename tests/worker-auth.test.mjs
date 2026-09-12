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

const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey);

async function signedRequest({ env, exp, nbf, kid = "test-key" }) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const value = `${encode({ alg: "RS256", kid })}.${encode({ iss: env.ACCESS_TEAM_DOMAIN, email: env.ALLOWED_EMAIL, aud: [env.ACCESS_AUD], exp, nbf })}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(value));
  return new Request("https://journal.example/api/bootstrap", { headers: { "cf-access-jwt-assertion": `${value}.${Buffer.from(signature).toString("base64url")}` } });
}

test("signed Access tokens require a valid expiration and not-before time", async (t) => {
  const now = 1_800_000_000;
  t.mock.method(Date, "now", () => now * 1000);
  t.mock.method(globalThis, "fetch", async () => Response.json({ keys: [{ ...publicKey, kid: "test-key" }] }));
  const env = { ACCESS_TEAM_DOMAIN: "https://claims.cloudflareaccess.com", ACCESS_AUD: "test-audience", ALLOWED_EMAIL: "test@example.com" };
  assert.equal(await validAccessRequest(await signedRequest({ env, exp: now + 60 }), env), true);
  for (const exp of [undefined, 0, now, now - 1, "never", String(now + 60), null]) {
    assert.equal(await validAccessRequest(await signedRequest({ env, exp }), env), false, `exp=${exp}`);
  }
  for (const nbf of ["later", null, now + 1]) {
    assert.equal(await validAccessRequest(await signedRequest({ env, exp: now + 60, nbf }), env), false, `nbf=${nbf}`);
  }
});

test("Access keys are scoped to their issuer and refresh after rotation", async (t) => {
  let now = 1_800_000_000_000;
  t.mock.method(Date, "now", () => now);
  let kid = "old-key";
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url) => {
    requests.push(url);
    return Response.json({ keys: [{ ...publicKey, kid }] });
  });
  const env = { ACCESS_TEAM_DOMAIN: "https://rotation.cloudflareaccess.com", ACCESS_AUD: "test", ALLOWED_EMAIL: "test@example.com" };
  const check = async (environment = env) => validAccessRequest(await signedRequest({ env: environment, exp: now / 1000 + 120, kid }), environment);
  assert.equal(await check(), true);
  assert.equal(await check(), true);
  assert.equal(requests.length, 1);
  kid = "new-key";
  now += 61_000;
  assert.equal(await check(), true);
  assert.equal(requests.length, 2);
  assert.equal(await check({ ...env, ACCESS_TEAM_DOMAIN: "https://second.cloudflareaccess.com" }), true);
  assert.equal(requests.length, 3);
  assert.match(requests[2], /second\.cloudflareaccess\.com/);
});
