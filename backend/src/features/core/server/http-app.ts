import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { createBlackBoxHandlers } from "../../black-box/handlers/black-box-handlers.js";
import { createOAuthHandlers } from "../../auth/handlers/oauth-handlers.js";
import { createMcpHandlers } from "../../mcp/handlers/mcp-handlers.js";
import { createAuthHandlers } from "../../auth/handlers/auth-handlers.js";
import { requireTrustedOrigin } from "../../auth/handlers/require-trusted-origin.js";
import { requireSession } from "../../auth/handlers/require-session.js";
import { resolveSession } from "../../auth/handlers/resolve-session.js";
import type { AuthEnvironment } from "../../auth/handlers/types.js";
import { defaultBodyLimit } from "../handlers/body-limit.js";
import { resolveClientAddress } from "../handlers/client-address.js";
import {
  createErrorHandler,
  handleNotFound,
} from "../handlers/error-responses.js";
import { logRequests } from "../handlers/request-log.js";
import type { RequestEnvironment } from "../handlers/types.js";
import { createHealthHandlers } from "../../health/handlers/health-handlers.js";
import { createSettingsHandlers } from "../../settings/handlers/settings-handlers.js";
import type { App } from "../types.js";

/** The server refuses a larger request body. A route that takes more uses `routeBodyLimit`. */
const MAX_REQUEST_BODY_BYTES = 100 * 1024;

interface ApiHttpAppProps {
  app: Pick<App, "logic" | "services" | "config">;
}

interface HttpAppProps extends ApiHttpAppProps {
  /** Set it only behind a proxy. See `resolveClientAddress`. */
  clientAddressHeader?: string | undefined;
}

/**
 * Every business route, including future routes, shares the session gate.
 */
function createBusinessHttpApp({ logic }: Pick<App, "logic">) {
  return new Hono<AuthEnvironment>()
    .use("*", requireSession())
    .get("/health", (context) => context.json({ ok: true as const }, 200))
    .route("/settings", createSettingsHandlers({ logic }));
}

/**
 * Routes under `/api`. The sign-in routes come first so they stay reachable
 * without a session, and every route after them passes the session gate.
 * `PUBLIC_ROUTES` in `backend-http.test.ts` lists each route before the gate.
 */
export function createApiHttpApp({ app }: ApiHttpAppProps) {
  return new Hono<AuthEnvironment>()
    .use("*", requireTrustedOrigin({ config: app.config }))
    .use("*", resolveSession({ services: app.services, logic: app.logic }))
    .route("/auth", createAuthHandlers({ logic: app.logic }))
    .route("/", createBusinessHttpApp({ logic: app.logic }));
}

export function createHttpApp({ app, clientAddressHeader }: HttpAppProps) {
  // The consent page sets its own headers: these would replace its
  // `X-Frame-Options: DENY` and its `same-origin` referrer policy.
  const defaultSecureHeaders = secureHeaders();
  const http = new Hono<RequestEnvironment>()
    .use("*", requestId())
    .use("*", (context, next) =>
      context.req.path === "/oauth/authorize"
        ? next()
        : defaultSecureHeaders(context, next),
    );
  // The Worker and the frontend share one origin, so a deployment sends no
  // CORS headers. Only a test backend behind a frontend on another origin has
  // trusted origins.
  if (app.config.trustedOrigins.length > 0) {
    http.use(
      "*",
      cors({
        origin: [...app.config.trustedOrigins],
        credentials: true,
        // A page on another origin can read only the headers in this list.
        exposeHeaders: ["X-Request-Id", "Retry-After"],
      }),
    );
  }
  // The reset route for the black-box tests exists only when the test-only
  // setting is on. It comes before `/api`, so the origin check does not apply.
  if (app.config.blackBox) {
    http.route(
      "/api/__black-box",
      createBlackBoxHandlers({ logic: app.logic }),
    );
  }
  return (
    http
      // A host sends a probe every few seconds. The health routes come before
      // the request log, so the probes do not fill it.
      .route("/health", createHealthHandlers({ logic: app.logic }))
      .use("*", logRequests({ services: app.services }))
      .use("*", defaultBodyLimit(MAX_REQUEST_BODY_BYTES))
      .use("*", resolveClientAddress({ header: clientAddressHeader }))
      // The routes for agents take a token, not the session cookie. The MCP
      // endpoint is under `/api`, so it comes before the session gate.
      .route("/", createMcpHandlers({ logic: app.logic }))
      .route(
        "/",
        createOAuthHandlers({ logic: app.logic, services: app.services }),
      )
      .route("/api", createApiHttpApp({ app }))
      .onError(createErrorHandler({ services: app.services }))
      .notFound(handleNotFound)
  );
}
