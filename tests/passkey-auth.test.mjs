import assert from "node:assert/strict";
import test from "node:test";
import { createAuthenticator } from "./helpers/passkey-authenticator.mjs";
import { ORIGIN, SETUP_CODE, authWorker, browser, setUp, signIn } from "./helpers/auth-worker.mjs";
import { deleteExpiredAuthData } from "../worker/auth/index.ts";

// The sign-in gate with the real SQL. The passkey answers come from a software
// authenticator, so the WebAuthn checks are real.

const MCP_HEADERS = { "content-type": "application/json", "mcp-protocol-version": "2025-06-18" };
const CLAUDE_REDIRECT = "http://localhost:54212/callback";

test("a new instance saves its first passkey with the setup code, then signs in with it", async () => {
  const worker = authWorker();
  const user = browser(worker);
  const phone = await createAuthenticator();

  assert.deepEqual((await user.call({ path: "/api/auth/status" })).body, { mode: "passkey", signedIn: false, hasPasskeys: false, setupCode: "ready" });
  const refused = await user.call({ path: "/api/bootstrap" });
  assert.equal(refused.status, 401);
  assert.deepEqual(refused.body, { error: "Sign in to continue.", code: "sign_in_required" });
  assert.equal((await user.call({ path: "/api/auth/login/options", method: "POST", body: {} })).body.code, "setup_required");

  // Another site cannot start the setup, and a wrong code does not work.
  const crossSite = await user.call({ path: "/api/auth/register/options", method: "POST", body: { setupCode: SETUP_CODE }, origin: "https://evil.example" });
  assert.equal(crossSite.status, 403);
  assert.equal(crossSite.body.code, "invalid_origin");
  const wrongCode = await user.call({ path: "/api/auth/register/options", method: "POST", body: { setupCode: "wrong code that is long" } });
  assert.equal(wrongCode.status, 403);
  assert.equal(wrongCode.body.code, "invalid_setup_code");

  const { options, verified } = await setUp({ user, authenticator: phone });
  assert.equal(options.body.options.rp.id, "journal.example");
  assert.equal(options.body.options.authenticatorSelection.residentKey, "required");
  assert.equal(options.body.options.authenticatorSelection.userVerification, "required");
  assert.equal(verified.status, 201);
  assert.equal(verified.body.passkey.id, phone.id);
  assert.match(verified.headers.get("set-cookie"), /^__Host-daymark_session=[A-Za-z0-9_-]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=34560000; Secure$/);

  // A challenge works once.
  const replay = await user.call({
    path: "/api/auth/register/verify",
    method: "POST",
    body: { challengeId: options.body.challengeId, response: await phone.register({ options: options.body.options, origin: ORIGIN }) },
  });
  assert.equal(replay.body.code, "challenge_expired");

  assert.equal((await user.call({ path: "/api/bootstrap" })).status, 200);
  assert.equal((await user.call({ path: "/api/auth/status" })).body.signedIn, true);

  // A write with the cookie must come from a page of this site.
  assert.equal((await user.call({ path: "/api/entries/2026-10-01", method: "PUT", body: {}, origin: null })).body.code, "invalid_origin");
  assert.equal((await user.call({ path: "/api/entries/2026-10-01", method: "PUT", body: {}, origin: "https://evil.example" })).body.code, "invalid_origin");
  assert.equal((await user.call({ path: "/api/entries/2026-10-01", method: "PUT", body: {} })).status, 200);
  assert.deepEqual(worker.reached, ["GET /api/bootstrap", "PUT /api/entries/2026-10-01"]);

  const signedOutCookie = user.jar.cookie;
  const logout = await user.call({ path: "/api/auth/logout", method: "POST", body: {} });
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
  // An ended session gets 401, and the browser drops its cookie.
  const oldSession = await worker.request({ path: "/api/bootstrap", headers: { cookie: signedOutCookie } });
  assert.equal(oldSession.status, 401);
  assert.match(oldSession.headers.get("set-cookie"), /^__Host-daymark_session=; .*Max-Age=0/);

  assert.equal((await signIn({ user, authenticator: phone, tamper: true })).body.code, "passkey_invalid");
  const signedIn = await signIn({ user, authenticator: phone });
  assert.equal(signedIn.status, 200);
  assert.equal((await user.call({ path: "/api/bootstrap" })).status, 200);

  const passkeys = await user.call({ path: "/api/auth/passkeys" });
  assert.equal(passkeys.body.passkeys.length, 1);
  assert.equal(passkeys.body.passkeys[0].current, true);
  assert.equal(passkeys.body.passkeys[0].synced, true);
  assert.ok(passkeys.body.passkeys[0].lastUsedAt);
  const removeLast = await user.call({ path: `/api/auth/passkeys/${phone.id}`, method: "DELETE" });
  assert.equal(removeLast.status, 409);
  assert.equal(removeLast.body.code, "last_passkey");

  // A stranger's passkey for this host is not in the database.
  assert.equal((await signIn({ user: browser(worker), authenticator: await createAuthenticator() })).body.code, "passkey_unknown");
});

test("a session moves its end at most once a day and sends its cookie again", async (t) => {
  let now = Date.UTC(2026, 9, 1);
  t.mock.method(Date, "now", () => now);
  const worker = authWorker();
  const user = browser(worker);
  await setUp({ user, authenticator: await createAuthenticator() });

  now += 60 * 60 * 1000;
  assert.equal((await user.call({ path: "/api/bootstrap" })).headers.get("set-cookie"), null);
  now += 2 * 24 * 60 * 60 * 1000;
  const renewed = await user.call({ path: "/api/bootstrap" });
  assert.equal(renewed.status, 200);
  assert.match(renewed.headers.get("set-cookie"), /Max-Age=34560000/);
  // 180 days without use end the session.
  now += 181 * 24 * 60 * 60 * 1000;
  assert.equal((await user.call({ path: "/api/bootstrap" })).status, 401);
});

test("the setup code adds a passkey after a lost device, and removing a passkey ends its sessions", async () => {
  const worker = authWorker();
  const phone = await createAuthenticator();
  const laptop = await createAuthenticator();
  const newPhone = await createAuthenticator();
  const phoneUser = browser(worker);
  assert.equal((await setUp({ user: phoneUser, authenticator: phone })).verified.status, 201);

  // A signed-in owner adds a passkey without the setup code.
  const laptopUser = browser(worker);
  laptopUser.jar.cookie = phoneUser.jar.cookie;
  const added = await setUp({ user: laptopUser, authenticator: laptop, setupCode: undefined });
  assert.equal(added.verified.status, 201);
  assert.equal(added.verified.headers.get("set-cookie"), null, "a signed-in owner keeps the session");
  // Without a session, a passkey needs the setup code.
  const noCode = await browser(worker).call({ path: "/api/auth/register/options", method: "POST", body: {} });
  assert.equal(noCode.body.code, "invalid_setup_code");

  // On a new device without a session, the setup code adds a passkey and signs in.
  const newPhoneUser = browser(worker);
  assert.equal((await setUp({ user: newPhoneUser, authenticator: newPhone })).verified.status, 201);
  assert.equal((await newPhoneUser.call({ path: "/api/auth/passkeys" })).body.passkeys.length, 3);

  // Remove the lost phone. The session that the phone signed in ends.
  const removed = await newPhoneUser.call({ path: `/api/auth/passkeys/${phone.id}`, method: "DELETE" });
  assert.deepEqual(removed.body, { removed: true, signedOut: false });
  assert.equal((await phoneUser.call({ path: "/api/bootstrap" })).status, 401);
  assert.equal((await newPhoneUser.call({ path: "/api/bootstrap" })).status, 200);
  assert.equal((await signIn({ user: browser(worker), authenticator: phone })).body.code, "passkey_unknown");

  // Removing the passkey of this browser signs it out.
  const own = await newPhoneUser.call({ path: `/api/auth/passkeys/${newPhone.id}`, method: "DELETE" });
  assert.deepEqual(own.body, { removed: true, signedOut: true });
  assert.equal(newPhoneUser.jar.cookie, null);
});

test("parallel wrong setup codes cannot pass the limit, and another network still gets its own tries", async () => {
  const worker = authWorker();
  const attacker = { "cf-connecting-ip": "203.0.113.7" };
  const results = await Promise.all(Array.from({ length: 30 }, (_, attempt) => worker.request({
    path: "/api/auth/register/options",
    method: "POST",
    body: { setupCode: `wrong code ${attempt}` },
    headers: { origin: ORIGIN, ...attacker },
  })));
  const codes = results.map((result) => result.body.code);
  const checked = codes.filter((code) => code === "invalid_setup_code").length;
  assert.ok(checked >= 1 && checked <= 10, codes.join(","));
  assert.equal(codes.filter((code) => code === "too_many_attempts").length, 30 - checked);
  // Refused attempts do not count against the shared limit, so the owner on another network can still set up.
  const owner = browser(worker);
  const options = await owner.call({ path: "/api/auth/register/options", method: "POST", body: { setupCode: SETUP_CODE }, headers: { "cf-connecting-ip": "198.51.100.4" } });
  assert.equal(options.status, 200);
});

test("wrong setup codes reach a limit, and a short or missing setup code is refused", async () => {
  const worker = authWorker();
  const user = browser(worker);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const wrong = await user.call({ path: "/api/auth/register/options", method: "POST", body: { setupCode: `wrong ${attempt}` } });
    assert.equal(wrong.body.code, "invalid_setup_code");
  }
  const limited = await user.call({ path: "/api/auth/register/options", method: "POST", body: { setupCode: SETUP_CODE } });
  assert.equal(limited.status, 429);
  assert.equal(limited.body.code, "too_many_attempts");

  for (const [setupCode, state, code] of [[undefined, "missing", "setup_code_missing"], ["too short", "too_short", "setup_code_too_short"]]) {
    const instance = authWorker({ env: { DAYMARK_SETUP_CODE: setupCode } });
    const visitor = browser(instance);
    assert.equal((await visitor.call({ path: "/api/auth/status" })).body.setupCode, state);
    const refusedSetup = await visitor.call({ path: "/api/auth/register/options", method: "POST", body: { setupCode: "too short" } });
    assert.equal(refusedSetup.status, 503);
    assert.equal(refusedSetup.body.code, code);
  }
});

test("two parallel removals cannot remove the last passkey", async () => {
  const worker = authWorker();
  const user = browser(worker);
  const phone = await createAuthenticator();
  const laptop = await createAuthenticator();
  await setUp({ user, authenticator: phone });
  await setUp({ user, authenticator: laptop });
  const [first, second] = await Promise.all([
    user.call({ path: `/api/auth/passkeys/${laptop.id}`, method: "DELETE" }),
    user.call({ path: `/api/auth/passkeys/${phone.id}`, method: "DELETE" }),
  ]);
  assert.deepEqual([first.status, second.status].sort(), [200, 409]);
  assert.equal((await worker.request({ path: "/api/auth/status" })).body.hasPasskeys, true);
});

test("local development skips sign-in unless DAYMARK_LOCAL_PASSKEYS turns it on", async () => {
  for (const origin of ["http://localhost:3000", "http://127.0.0.1:8787", "http://[::1]:8787"]) {
    const local = authWorker({ origin });
    assert.equal((await local.request({ path: "/api/bootstrap" })).status, 200, origin);
    assert.equal((await local.request({ path: "/api/mcp", method: "POST", headers: MCP_HEADERS, body: { jsonrpc: "2.0", id: 1, method: "tools/list" } })).status, 200, origin);
    assert.deepEqual((await local.request({ path: "/api/auth/status" })).body, { mode: "local" });
    assert.equal((await local.request({ path: "/api/auth/login/options", method: "POST", body: {}, headers: { origin } })).status, 404);
  }

  const passkeys = authWorker({ origin: "http://localhost:3000", env: { DAYMARK_LOCAL_PASSKEYS: "true" } });
  assert.equal((await passkeys.request({ path: "/api/bootstrap" })).status, 401);
  const user = browser(passkeys);
  const laptop = await createAuthenticator();
  await setUp({ user, authenticator: laptop, origin: "http://localhost:3000" });
  assert.ok(user.jar.cookie.startsWith("daymark_session="));
  assert.equal((await user.call({ path: "/api/bootstrap" })).status, 200);

  // A public host always needs sign-in, whatever the flag says.
  assert.equal((await authWorker({ env: { DAYMARK_LOCAL_PASSKEYS: "false" } }).request({ path: "/api/bootstrap" })).status, 401);
});

test("pages and static files do not need sign-in", async () => {
  const worker = authWorker();
  for (const path of ["/", "/insights", "/sign-in", "/manifest.webmanifest"]) {
    assert.equal((await worker.request({ path })).status, 200, path);
  }
});

async function pkcePair() {
  const verifier = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  const challenge = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))).toString("base64url");
  return { verifier, challenge };
}

function authorizeParams({ clientId, challenge, state = "state-123", redirectUri = CLAUDE_REDIRECT, extra = {} }) {
  return new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    resource: `${ORIGIN}/api/mcp`,
    ...extra,
  });
}

async function tokenRequest(worker, { client, form }) {
  const headers = { "content-type": "application/x-www-form-urlencoded" };
  const body = new URLSearchParams(form);
  if (client.client_secret) headers.authorization = `Basic ${btoa(`${client.client_id}:${client.client_secret}`)}`;
  else body.set("client_id", client.client_id);
  const response = await worker.fetch("/oauth/token", { method: "POST", headers, body: body.toString() });
  return { status: response.status, headers: response.headers, body: await response.json() };
}

/** Approve an authorization request on the consent page and return the redirect. */
async function approve(user, params) {
  const consent = await user.page(`/oauth/authorize?${params}`);
  assert.equal(consent.status, 200);
  const form = new URLSearchParams(params);
  form.set("decision", "allow");
  const answer = await user.page("/oauth/authorize", {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  assert.equal(answer.status, 303);
  return new URL(answer.headers.get("location"));
}

function mcpToolsList(worker, { token = null, cookie = null } = {}) {
  return worker.request({
    path: "/api/mcp",
    method: "POST",
    headers: { ...MCP_HEADERS, ...(token ? { authorization: `Bearer ${token}` } : {}), ...(cookie ? { cookie } : {}) },
    body: { jsonrpc: "2.0", id: 1, method: "tools/list" },
  });
}

test("Claude Code connects to the MCP endpoint with OAuth after the owner allows it", async () => {
  const worker = authWorker();
  const user = browser(worker);
  await setUp({ user, authenticator: await createAuthenticator() });

  const resource = await worker.request({ path: "/.well-known/oauth-protected-resource/api/mcp" });
  assert.deepEqual(resource.body, {
    resource: `${ORIGIN}/api/mcp`,
    authorization_servers: [ORIGIN],
    bearer_methods_supported: ["header"],
    resource_name: "daymark",
  });
  assert.equal(resource.headers.get("access-control-allow-origin"), "*");
  assert.deepEqual((await worker.request({ path: "/.well-known/oauth-protected-resource" })).body, resource.body);
  const server = (await worker.request({ path: "/.well-known/oauth-authorization-server" })).body;
  assert.equal(server.issuer, ORIGIN);
  assert.deepEqual(server.code_challenge_methods_supported, ["S256"]);
  assert.equal(server.authorization_response_iss_parameter_supported, true);
  assert.equal(server.registration_endpoint, `${ORIGIN}/oauth/register`);

  const unauthenticated = await mcpToolsList(worker);
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.headers.get("www-authenticate"), `Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/api/mcp"`);
  // The session cookie of the owner does not work for MCP.
  assert.equal((await mcpToolsList(worker, { cookie: user.jar.cookie })).status, 401);

  // One network cannot use up the registrations of everyone.
  for (let index = 0; index < 10; index += 1) {
    const spam = await worker.request({ path: "/oauth/register", method: "POST", body: { redirect_uris: ["https://spam.example/cb"] }, headers: { "cf-connecting-ip": "203.0.113.9" } });
    assert.equal(spam.status, 201);
  }
  const limited = await worker.request({ path: "/oauth/register", method: "POST", body: { redirect_uris: ["https://spam.example/cb"] }, headers: { "cf-connecting-ip": "203.0.113.9" } });
  assert.equal(limited.status, 429);

  const badRedirect = await worker.request({ path: "/oauth/register", method: "POST", body: { redirect_uris: ["http://evil.example/callback"] } });
  assert.equal(badRedirect.status, 400);
  assert.equal(badRedirect.body.error, "invalid_redirect_uri");
  const registered = await worker.request({ path: "/oauth/register", method: "POST", body: { client_name: "Claude Code", redirect_uris: [CLAUDE_REDIRECT], token_endpoint_auth_method: "none" } });
  assert.equal(registered.status, 201);
  const client = registered.body;
  assert.equal(client.client_secret, undefined);

  // Without a session, the authorize page sends the owner to sign in first, then back.
  const { verifier, challenge } = await pkcePair();
  const params = authorizeParams({ clientId: client.client_id, challenge });
  const signedOutPage = await browser(worker).page(`/oauth/authorize?${params}`);
  assert.equal(signedOutPage.status, 303);
  const signInUrl = new URL(signedOutPage.headers.get("location"), ORIGIN);
  assert.equal(signInUrl.pathname, "/sign-in");
  assert.equal(signInUrl.searchParams.get("returnTo"), `/oauth/authorize?${params}`);

  const consent = await user.page(`/oauth/authorize?${params}`);
  const consentHtml = await consent.text();
  assert.match(consentHtml, /Connect Claude Code to daymark\?/);
  assert.match(consentHtml, /<strong>localhost:54212<\/strong>/);
  assert.equal(consent.headers.get("x-frame-options"), "DENY");
  assert.match(consent.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  // With no-referrer, a browser sends Origin: null with the form, and the owner's own answer fails.
  assert.equal(consent.headers.get("referrer-policy"), "same-origin");

  // An answer from another site does not count.
  const crossSite = await user.page("/oauth/authorize", {
    method: "POST",
    headers: { origin: "https://evil.example", "content-type": "application/x-www-form-urlencoded" },
    body: `${params}&decision=allow`,
  });
  assert.equal(crossSite.status, 403);

  const redirect = await approve(user, params);
  assert.equal(`${redirect.origin}${redirect.pathname}`, CLAUDE_REDIRECT);
  assert.equal(redirect.searchParams.get("state"), "state-123");
  assert.equal(redirect.searchParams.get("iss"), ORIGIN);
  const code = redirect.searchParams.get("code");
  assert.ok(code);

  const tokens = await tokenRequest(worker, {
    client,
    form: { grant_type: "authorization_code", code, redirect_uri: CLAUDE_REDIRECT, code_verifier: verifier, resource: `${ORIGIN}/api/mcp` },
  });
  assert.equal(tokens.status, 200, JSON.stringify(tokens.body));
  assert.equal(tokens.body.token_type, "Bearer");
  assert.equal(tokens.body.expires_in, 3600);
  assert.equal(tokens.headers.get("cache-control"), "no-store");
  const reused = await tokenRequest(worker, { client, form: { grant_type: "authorization_code", code, redirect_uri: CLAUDE_REDIRECT, code_verifier: verifier } });
  assert.equal(reused.body.error, "invalid_grant");

  const listed = await mcpToolsList(worker, { token: tokens.body.access_token });
  assert.equal(listed.status, 200);
  assert.ok(listed.body.result.tools.some((tool) => tool.name === "get_overview"));
  const wrongToken = await mcpToolsList(worker, { token: "dma_not_a_real_token_value_at_all" });
  assert.equal(wrongToken.status, 401);
  assert.match(wrongToken.headers.get("www-authenticate"), /error="invalid_token"/);

  // A public client gets a new refresh token at each refresh. The old one works for a short time, so a client that lost the answer can retry.
  const rotated = await tokenRequest(worker, { client, form: { grant_type: "refresh_token", refresh_token: tokens.body.refresh_token } });
  assert.equal(rotated.status, 200);
  assert.notEqual(rotated.body.refresh_token, tokens.body.refresh_token);
  const retry = await tokenRequest(worker, { client, form: { grant_type: "refresh_token", refresh_token: tokens.body.refresh_token } });
  assert.equal(retry.status, 200);
  assert.equal((await mcpToolsList(worker, { token: rotated.body.access_token })).status, 200);

  const connections = await user.call({ path: "/api/auth/connections" });
  assert.equal(connections.body.connections.length, 1);
  assert.equal(connections.body.connections[0].name, "Claude Code");
  assert.ok(connections.body.connections[0].lastUsedAt);
  const disconnected = await user.call({ path: `/api/auth/connections/${connections.body.connections[0].id}`, method: "DELETE" });
  assert.equal(disconnected.status, 200);
  assert.equal((await mcpToolsList(worker, { token: rotated.body.access_token })).status, 401);
  const afterDisconnect = await tokenRequest(worker, { client, form: { grant_type: "refresh_token", refresh_token: rotated.body.refresh_token } });
  assert.equal(afterDisconnect.body.error, "invalid_grant");
});

test("OAuth refuses a bad request, a wrong verifier and a denial, and a confidential client keeps its refresh token", async () => {
  const worker = authWorker();
  const user = browser(worker);
  await setUp({ user, authenticator: await createAuthenticator() });
  const redirectUri = "https://agent.example/callback";
  const client = (await worker.request({ path: "/oauth/register", method: "POST", body: { client_name: "Agent", redirect_uris: [redirectUri] } })).body;
  assert.equal(client.token_endpoint_auth_method, "client_secret_basic");
  assert.ok(client.client_secret);
  const { verifier, challenge } = await pkcePair();

  // A return address that the client did not register shows an error page and never redirects.
  const unregistered = await user.page(`/oauth/authorize?${authorizeParams({ clientId: client.client_id, challenge, redirectUri: "https://evil.example/cb" })}`);
  assert.equal(unregistered.status, 400);
  assert.match(await unregistered.text(), /did not register/);
  // Other errors also show on the page. Anyone can register a client, so an error redirect would be an open redirect.
  for (const [extra, message] of [
    [{ code_challenge_method: "plain" }, /did not use PKCE/],
    [{ resource: "https://other.example/api/mcp" }, /asked for another resource/],
    [{ response_type: "token" }, /unsupported response type/],
  ]) {
    for (const visitor of [user, browser(worker)]) {
      const response = await visitor.page(`/oauth/authorize?${authorizeParams({ clientId: client.client_id, challenge, redirectUri, extra })}`);
      assert.equal(response.status, 400);
      assert.equal(response.headers.get("location"), null);
      assert.match(await response.text(), message);
    }
  }

  const denied = await user.page("/oauth/authorize", {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/x-www-form-urlencoded" },
    body: `${authorizeParams({ clientId: client.client_id, challenge, redirectUri })}&decision=deny`,
  });
  assert.equal(new URL(denied.headers.get("location")).searchParams.get("error"), "access_denied");

  const wrongVerifierCode = (await approve(user, authorizeParams({ clientId: client.client_id, challenge, redirectUri }))).searchParams.get("code");
  const wrongVerifier = await tokenRequest(worker, { client, form: { grant_type: "authorization_code", code: wrongVerifierCode, redirect_uri: redirectUri, code_verifier: "x".repeat(43) } });
  assert.equal(wrongVerifier.body.error, "invalid_grant");

  const code = (await approve(user, authorizeParams({ clientId: client.client_id, challenge, redirectUri }))).searchParams.get("code");
  const tokens = await tokenRequest(worker, { client, form: { grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier } });
  assert.equal(tokens.status, 200);
  // A second approval replaces the first connection of the same app.
  assert.equal((await user.call({ path: "/api/auth/connections" })).body.connections.length, 1);

  const refreshed = await tokenRequest(worker, { client, form: { grant_type: "refresh_token", refresh_token: tokens.body.refresh_token } });
  assert.equal(refreshed.status, 200);
  assert.equal(refreshed.body.refresh_token, tokens.body.refresh_token);
  assert.notEqual(refreshed.body.access_token, tokens.body.access_token);

  const wrongSecret = await tokenRequest(worker, { client: { ...client, client_secret: "dms_wrong" }, form: { grant_type: "refresh_token", refresh_token: tokens.body.refresh_token } });
  assert.equal(wrongSecret.status, 401);
  assert.equal(wrongSecret.body.error, "invalid_client");
  const unsupported = await tokenRequest(worker, { client, form: { grant_type: "client_credentials" } });
  assert.equal(unsupported.body.error, "unsupported_grant_type");
});

test("the cleanup removes expired sign-in data and keeps live data", async (t) => {
  let now = Date.UTC(2026, 9, 1);
  t.mock.method(Date, "now", () => now);
  const worker = authWorker();
  const user = browser(worker);
  await setUp({ user, authenticator: await createAuthenticator() });
  await worker.request({ path: "/api/auth/login/options", method: "POST", body: {}, headers: { origin: ORIGIN } });
  await worker.request({ path: "/oauth/register", method: "POST", body: { redirect_uris: ["https://agent.example/cb"] } });
  const count = (table) => worker.db.sqlite.prepare(`SELECT count(*) AS value FROM ${table}`).get().value;
  assert.deepEqual(["auth_sessions", "auth_challenges", "oauth_clients"].map(count), [1, 1, 1]);

  await deleteExpiredAuthData(worker.db);
  assert.deepEqual(["auth_sessions", "auth_challenges", "oauth_clients"].map(count), [1, 1, 1]);

  now += 2 * 24 * 60 * 60 * 1000;
  await deleteExpiredAuthData(worker.db);
  // The challenge expired and nobody allowed the client. The session lives 180 days.
  assert.deepEqual(["auth_sessions", "auth_challenges", "oauth_clients"].map(count), [1, 0, 0]);
  now += 200 * 24 * 60 * 60 * 1000;
  await deleteExpiredAuthData(worker.db);
  assert.equal(count("auth_sessions"), 0);
});
