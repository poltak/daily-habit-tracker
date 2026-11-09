// Run: node --experimental-strip-types tests/browser/journal-sign-in.mjs
// Use Playwright from NODE_PATH. Set JOURNAL_TEST_BROWSER=chrome to use an installed Chrome browser.
// The test starts its own Worker with passkey sign-in on, with an empty database in a temporary
// directory. Chromium's virtual authenticator answers the passkey requests, so the WebAuthn checks are real.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(import.meta.url)("playwright");
const root = fileURLToPath(new URL("../../", import.meta.url));
const wrangler = join(root, "node_modules/wrangler/bin/wrangler.js");
const port = 3104;
const baseURL = `http://localhost:${port}`;
const SETUP_CODE = "correct horse battery staple";

const persistence = await mkdtemp(join(tmpdir(), "daymark-sign-in-"));
execFileSync(process.execPath, ["--no-warnings", join(root, "vanilla/build.mjs")], { cwd: root, stdio: "ignore" });
execFileSync(process.execPath, [wrangler, "d1", "migrations", "apply", "daylio-clone", "--local", "--config", "wrangler.jsonc", "--persist-to", persistence], { cwd: root, stdio: "ignore", env: { ...process.env, CI: "1" } });
const server = spawn(process.execPath, [
  wrangler, "dev", "--config", "vanilla/wrangler.jsonc", "--local", "--persist-to", persistence, "--port", String(port),
  "--var", "DAYMARK_LOCAL_PASSKEYS:true", "--var", `DAYMARK_SETUP_CODE:${SETUP_CODE}`,
], { cwd: root, env: { ...process.env, CI: "1", NO_COLOR: "1" }, stdio: ["ignore", "pipe", "pipe"] });
server.stdout.on("data", () => {});
server.stderr.on("data", () => {});

const browser = await chromium.launch({ headless: true, channel: process.env.JOURNAL_TEST_BROWSER });
try {
  for (let attempt = 0; ; attempt += 1) {
    try {
      if ((await fetch(`${baseURL}/api/auth/status`)).ok) break;
    } catch {
      // Wrangler is still starting.
    }
    if (attempt > 120) throw new Error("Timed out waiting for Wrangler.");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => void dialog.accept());
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });

  // Without a session, the journal sends the browser to the sign-in page, which asks for the setup code.
  await page.goto("/?view=settings");
  await page.waitForURL("**/sign-in?returnTo=%2F%3Fview%3Dsettings");
  await page.getByRole("heading", { name: "Set up daymark" }).waitFor();
  assert.equal(await page.evaluate(() => fetch("/api/bootstrap").then((response) => response.status)), 401);

  await page.getByLabel("Setup code").fill("a wrong setup code");
  await page.getByRole("button", { name: "Create passkey" }).click();
  await page.getByRole("alert").filter({ hasText: "This setup code is not correct." }).waitFor();
  assert.equal(await page.getByLabel("Setup code").inputValue(), "a wrong setup code", "the code stays in its field after an error");

  await page.getByLabel("Setup code").fill(SETUP_CODE);
  await page.getByRole("button", { name: "Create passkey" }).click();
  await page.waitForURL(`${baseURL}/?view=settings`);
  assert.equal((await cdp.send("WebAuthn.getCredentials", { authenticatorId })).credentials.length, 1);

  // Setup lists the passkey of this device. The last passkey cannot be removed.
  const signInCard = page.locator(".account-card");
  await signInCard.waitFor();
  await signInCard.getByText(/· this device$/).waitFor();
  assert.equal(await signInCard.getByRole("button", { name: /^Remove passkey/ }).isDisabled(), true);
  assert.match(await signInCard.locator(".account-empty").innerText(), /No apps are connected/);

  // Sign out, then sign in again with the passkey.
  await signInCard.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/sign-in?returnTo=%2F");
  await page.getByRole("heading", { name: "Sign in to daymark" }).waitFor();
  await page.getByRole("button", { name: "Sign in with passkey" }).click();
  await page.waitForURL(`${baseURL}/`);
  await page.getByRole("heading", { name: "How was your day?" }).waitFor();
  assert.equal(await page.evaluate(() => fetch("/api/bootstrap").then((response) => response.status)), 200);

  // Allow on the consent page sends the browser to the app's callback on another origin.
  const client = await (await fetch(`${baseURL}/oauth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "Claude Code", redirect_uris: ["http://127.0.0.1:3199/callback"], token_endpoint_auth_method: "none" }),
  })).json();
  const authorize = new URLSearchParams({
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: "http://127.0.0.1:3199/callback",
    code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    code_challenge_method: "S256",
    state: "state-1",
  });
  await page.goto(`/oauth/authorize?${authorize}`);
  await page.getByRole("heading", { name: "Connect Claude Code to daymark?" }).waitFor();
  const callback = page.waitForRequest((request) => request.url().startsWith("http://127.0.0.1:3199/callback"), { timeout: 10_000 });
  await page.getByRole("button", { name: "Allow" }).click();
  const callbackUrl = new URL((await callback).url());
  assert.equal(callbackUrl.searchParams.get("state"), "state-1");
  assert.ok(callbackUrl.searchParams.get("code"));

  // An OAuth request without a session goes to sign-in first, with a fixed notice.
  const other = await browser.newContext({ baseURL, serviceWorkers: "block" });
  const otherPage = await other.newPage();
  await otherPage.goto("/sign-in?returnTo=%2Foauth%2Fauthorize%3Fclient_id%3Dx");
  await otherPage.getByText("An app wants to connect to your daymark.").waitFor();
  // A return address on another site is not followed.
  await otherPage.goto("/sign-in?returnTo=https%3A%2F%2Fevil.example%2F");
  await otherPage.getByRole("heading", { name: "Sign in to daymark" }).waitFor();
  await other.close();

  assert.deepEqual(errors, []);
  console.log("PASS: setup code, passkey sign-up, Setup passkey list, sign out, passkey sign-in, OAuth consent redirect, OAuth notice.");
} finally {
  await browser.close();
  server.kill("SIGTERM");
  await rm(persistence, { recursive: true, force: true });
}
