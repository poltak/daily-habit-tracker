import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Daymark journal shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>daymark — your daily journal<\/title>/i);
  assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest" crossorigin="use-credentials"\s*\/?>/i);
  assert.match(html, /How did your day feel\?/);
  assert.match(html, /aria-label="Primary navigation"/);
  assert.match(html, /class="journal-loading" aria-busy="true"/);
  assert.match(html, /Loading journal data/);
  assert.doesNotMatch(html, /Opening your journal/);
  assert.doesNotMatch(html, /Codex|sites-skeleton|react-loading-skeleton|codex-preview/);
});

test("unknown routes do not render the journal layout", async () => {
  const response = await render("/missing-page");
  assert.equal(response.status, 404);
  assert.doesNotMatch(await response.text(), /class="journal-loading"/);
});

test("does not keep the temporary starter preview", async () => {
  await assert.rejects(access(new URL("public/_sites-preview", templateRoot)));
});
