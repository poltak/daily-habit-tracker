import { env as globalEnvironment } from "cloudflare:workers";
import type { ExecutionContext } from "hono";
import { createApp, type WorkerEnvironment } from "../live/index.js";
import { createHttpApp } from "./http-app.js";

/**
 * One App for each isolate, made in the global scope. A new App for each
 * request would build the router, each Logic class and each Storage class
 * again. Nothing here does I/O, and the App holds only bindings and plain
 * values.
 *
 * `initializeLogic` does not run here, so no backend Logic can have a start-up
 * hook. Global scope cannot do I/O, so such a hook could not read anything.
 */
const app = createApp({
  env: globalEnvironment as unknown as WorkerEnvironment,
  // The one place in the Worker that writes to the console.
  // oxlint-disable-next-line no-console
  writeLogLine: (line) => console.log(line),
});
const httpApp = createHttpApp({
  app,
  // A Worker has no socket address to read. Cloudflare sets this header.
  clientAddressHeader: "cf-connecting-ip",
});

/**
 * The pages of the frontend router. The Worker answers each one with
 * `index.html` and status 200. This is the one list of pages: add a page here
 * when a feature adds a route to the router. Any other path that no file or
 * backend route answers gets `index.html` with status 404, so the router shows
 * its own "Page not found" page.
 */
const APP_PAGES = new Set(["/", "/insights", "/sign-in", "/login"]);

/** A 404 under these paths comes from a backend route, so it stays JSON. */
const BACKEND_PREFIXES = [
  "/api/",
  "/oauth/",
  "/.well-known/",
  "/mcp",
  "/health",
];

interface AssetsEnvironment extends WorkerEnvironment {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(
    request: Request,
    env: AssetsEnvironment,
    context: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return httpApp.fetch(request, env, context);
    }
    const indexRequest = new Request(new URL("/", url), request);
    if (APP_PAGES.has(url.pathname)) {
      return env.ASSETS.fetch(indexRequest);
    }
    // `run_worker_first` is `true`, so a file comes through here too.
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) {
      return asset;
    }
    const response = await httpApp.fetch(request, env, context);
    if (
      response.status !== 404 ||
      BACKEND_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))
    ) {
      return response;
    }
    const index = await env.ASSETS.fetch(indexRequest);
    return new Response(index.body, {
      status: 404,
      headers: index.headers,
    });
  },
  /** The hourly cron of `wrangler.jsonc` removes expired sessions, challenges, codes and tokens. */
  async scheduled(): Promise<void> {
    await app.logic.authSession.deleteExpired();
  },
};
