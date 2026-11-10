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
 * `index.html`, and any other path that is not a file gets the 404 page of the
 * assets. Each path here is also in `assets.run_worker_first` of
 * `wrangler.jsonc`: add a page to both. `/` is `index.html` itself, so the
 * assets answer it.
 */
const APP_PAGES = new Set(["/sign-in", "/login", "/insights"]);

interface AssetsEnvironment extends WorkerEnvironment {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  fetch(request: Request, env: AssetsEnvironment, context: ExecutionContext) {
    const url = new URL(request.url);
    if (
      (request.method === "GET" || request.method === "HEAD") &&
      APP_PAGES.has(url.pathname)
    ) {
      return env.ASSETS.fetch(new Request(new URL("/", url), request));
    }
    return httpApp.fetch(request, env, context);
  },
  /** The hourly cron of `wrangler.jsonc` removes expired sessions, challenges, codes and tokens. */
  async scheduled(): Promise<void> {
    await app.logic.authSession.deleteExpired();
  },
};
