import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

function worker() {
  const listeners = new Map();
  const cached = new Map();
  const deletedCaches = [];
  const cache = {
    async put(key, value) { cached.set(typeof key === "string" ? key : key.url, value); },
    async match(key) { return cached.get(typeof key === "string" ? key : key.url); },
  };
  let network = async () => new Response("asset");
  runInNewContext(source, {
    URL, Response,
    self: { location: { origin: "https://journal.example" }, addEventListener: (name, handler) => listeners.set(name, handler), clients: { claim() {} }, skipWaiting() {} },
    caches: { open: async () => cache, keys: async () => ["daymark-shell-v3", "daymark-shell-v4", "other-app"], delete: async (key) => deletedCaches.push(key) },
    fetch: (...args) => network(...args),
  });
  return {
    cached, deletedCaches,
    network(callback) { network = callback; },
    async dispatch(name, request) {
      const pending = [];
      let response;
      listeners.get(name)({ request, respondWith: (promise) => { response = promise; }, waitUntil: (promise) => pending.push(promise) });
      const result = await response;
      for (const promise of pending) await promise;
      return { response: result, backgroundWrites: pending.length };
    },
  };
}

const navigation = { url: "https://journal.example/?view=calendar", method: "GET", mode: "navigate" };
const asset = { url: "https://journal.example/assets/app.js", method: "GET", destination: "script" };

test("service worker retains a good offline shell after HTTP errors and redirects", async () => {
  const runtime = worker();
  runtime.network(async () => new Response("good shell", { headers: { "content-type": "text/html" } }));
  const loaded = await runtime.dispatch("fetch", navigation);
  assert.equal(loaded.backgroundWrites, 1);
  for (const response of [new Response("failed", { status: 503, headers: { "content-type": "text/html" } }), new Response("login", { headers: { "content-type": "text/html" } })]) {
    if (response.status === 200) Object.defineProperty(response, "redirected", { value: true });
    runtime.network(async () => response);
    await runtime.dispatch("fetch", navigation);
  }
  runtime.network(async () => { throw new Error("offline"); });
  assert.equal(await (await runtime.dispatch("fetch", navigation)).response.text(), "good shell");
});

test("service worker caches only successful assets and skips API and RSC requests", async () => {
  const runtime = worker();
  runtime.network(async () => new Response("missing", { status: 404 }));
  await runtime.dispatch("fetch", asset);
  assert.equal(runtime.cached.size, 0);
  runtime.network(async () => new Response("script"));
  assert.equal((await runtime.dispatch("fetch", asset)).backgroundWrites, 1);
  runtime.network(async () => { throw new Error("cached assets must not refetch"); });
  assert.equal(await (await runtime.dispatch("fetch", asset)).response.text(), "script");
  for (const request of [
    { ...asset, url: "https://journal.example/api/export" },
    { ...asset, url: "https://journal.example/?_rsc=state", destination: "" },
    { ...asset, url: "https://other.example/private" },
  ]) assert.equal((await runtime.dispatch("fetch", request)).response, undefined);
});

test("service worker activation removes only its own old caches", async () => {
  const runtime = worker();
  await runtime.dispatch("activate");
  assert.deepEqual(runtime.deletedCaches, ["daymark-shell-v3"]);
});
