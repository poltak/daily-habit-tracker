import { clearedSessionCookie, isSameOriginWrite, readSessionCookie, sessionCookie } from "./cookies.ts";
import { AuthError, authErrorResponse, authJson, readJsonObject, readSmallText, type AuthEnvironment } from "./http.ts";
import {
  OAuthError,
  approveAuthorization,
  authorizationServerMetadata,
  bearerChallenge,
  checkAuthorizationRequest,
  deleteExpiredOAuthRows,
  denyAuthorization,
  exchangeToken,
  listConnections,
  protectedResourceMetadata,
  registerClient,
  removeConnection,
  verifyAccessToken,
  type AuthorizationRequest,
} from "./oauth.ts";
import { renderConsentPage, renderOAuthErrorPage } from "./pages.ts";
import {
  checkSetupCode,
  finishPasskeyRegistration,
  finishPasskeySignIn,
  relyingParty,
  setupCodeState,
  startPasskeyRegistration,
  startPasskeySignIn,
} from "./passkeys.ts";
import { countPasskeys, createSession, deleteExpiredAuthRows, deletePasskey, deleteSession, findSession, listPasskeys, type Session } from "./store.ts";
import { networkKey } from "./tokens.ts";

export type { AuthEnvironment } from "./http.ts";

// The sign-in gate of both Workers. The sign-in routes, the OAuth routes and
// the MCP bearer check are here, so the React and the plain Worker share them.
// See docs/sign-in.md.

type Context = { request: Request; env: AuthEnvironment; url: URL };

function isLocalHost(url: URL) {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1" || url.hostname === "[::1]";
}

/** Local development skips sign-in, unless DAYMARK_LOCAL_PASSKEYS turns it on. A public host always needs sign-in. */
function skipsSignIn({ url, env }: { url: URL; env: AuthEnvironment }) {
  return isLocalHost(url) && env.DAYMARK_LOCAL_PASSKEYS !== "true";
}

async function readSession({ request, env }: Context): Promise<{ session: Session; token: string; renewed: boolean } | null> {
  const token = readSessionCookie(request);
  if (!token) return null;
  const found = await findSession({ db: env.DB, token });
  return found ? { ...found, token } : null;
}

function requireSameOrigin(request: Request) {
  if (!isSameOriginWrite(request)) throw new AuthError(403, "invalid_origin", "The request must come from this site.");
}

async function requireSession(context: Context) {
  const live = await readSession(context);
  if (!live) throw new AuthError(401, "sign_in_required", "Sign in to continue.");
  requireSameOrigin(context.request);
  return live;
}

async function startSession({ request, env }: Context, passkeyId: string): Promise<Record<string, string>> {
  const token = await createSession({ db: env.DB, passkeyId });
  return { "set-cookie": sessionCookie({ url: new URL(request.url), token }) };
}

/** The `/api/auth/*` routes. */
async function authRoute(context: Context, pathname: string): Promise<Response> {
  const { request, env } = context;
  const db = env.DB;
  const method = request.method;
  const rp = () => relyingParty(request);

  if (pathname === "/api/auth/status" && method === "GET") {
    if (skipsSignIn(context)) return authJson({ mode: "local" });
    const [live, passkeys] = await Promise.all([readSession(context), countPasskeys({ db })]);
    return authJson({ mode: "passkey", signedIn: live !== null, hasPasskeys: passkeys > 0, setupCode: setupCodeState(env.DAYMARK_SETUP_CODE) });
  }
  if (skipsSignIn(context)) throw new AuthError(404, "sign_in_off", "Sign-in is off on this local server.");

  // Start to add a passkey. A signed-in owner can add one. Without a session, the
  // setup code is required: for the first passkey, or after a lost device.
  if (pathname === "/api/auth/register/options" && method === "POST") {
    requireSameOrigin(request);
    const body = await readJsonObject(request);
    if (!(await readSession(context))) {
      await checkSetupCode({ db, configured: env.DAYMARK_SETUP_CODE, given: body.setupCode, network: await networkKey(request) });
    }
    return authJson(await startPasskeyRegistration({ db, rp: rp() }));
  }
  // Save a new passkey. The challenge came only to a signed-in owner or to a person
  // with the setup code, and it works once. Without a session, the new passkey signs the browser in.
  if (pathname === "/api/auth/register/verify" && method === "POST") {
    requireSameOrigin(request);
    const body = await readJsonObject(request);
    const passkey = await finishPasskeyRegistration({ db, rp: rp(), body, userAgent: request.headers.get("user-agent") });
    const headers = (await readSession(context)) ? {} : await startSession(context, passkey.id);
    return authJson({ passkey }, { status: 201, headers });
  }
  if (pathname === "/api/auth/login/options" && method === "POST") {
    requireSameOrigin(request);
    return authJson(await startPasskeySignIn({ db, rp: rp() }));
  }
  if (pathname === "/api/auth/login/verify" && method === "POST") {
    requireSameOrigin(request);
    const passkey = await finishPasskeySignIn({ db, rp: rp(), body: await readJsonObject(request) });
    return authJson({ signedIn: true }, { headers: await startSession(context, passkey.id) });
  }
  // End the session of this browser. It works without a live session, so an expired cookie also goes.
  if (pathname === "/api/auth/logout" && method === "POST") {
    requireSameOrigin(request);
    const token = readSessionCookie(request);
    if (token) await deleteSession({ db, token });
    return authJson({ signedIn: false }, { headers: { "set-cookie": clearedSessionCookie(context.url) } });
  }
  if (pathname === "/api/auth/passkeys" && method === "GET") {
    const live = await requireSession(context);
    const passkeys = await listPasskeys({ db });
    return authJson({
      passkeys: passkeys.map((passkey) => ({
        id: passkey.id,
        name: passkey.name,
        createdAt: passkey.createdAt,
        lastUsedAt: passkey.lastUsedAt,
        synced: passkey.backedUp,
        current: passkey.id === live.session.passkeyId,
      })),
    });
  }
  // Remove a passkey, such as the one of a lost phone. Its sessions end. The last passkey stays, so the owner keeps a way in.
  const passkeyId = pathname.match(/^\/api\/auth\/passkeys\/([^/]+)$/)?.[1];
  if (passkeyId && method === "DELETE") {
    const live = await requireSession(context);
    const id = decodeURIComponent(passkeyId);
    const result = await deletePasskey({ db, id });
    if (result === "last") throw new AuthError(409, "last_passkey", "Add another passkey before you remove this one.");
    if (result === "missing") throw new AuthError(404, "not_found", "Passkey not found.");
    const signedOut = live.session.passkeyId === id;
    return authJson({ removed: true, signedOut }, { headers: signedOut ? { "set-cookie": clearedSessionCookie(context.url) } : {} });
  }
  // The apps, such as Claude Code, that the owner allowed to use the MCP endpoint.
  if (pathname === "/api/auth/connections" && method === "GET") {
    await requireSession(context);
    return authJson({ connections: await listConnections({ db }) });
  }
  const connectionId = pathname.match(/^\/api\/auth\/connections\/([^/]+)$/)?.[1];
  if (connectionId && method === "DELETE") {
    await requireSession(context);
    if (!(await removeConnection({ db, id: decodeURIComponent(connectionId) }))) throw new AuthError(404, "not_found", "Connection not found.");
    return authJson({ removed: true });
  }
  return authJson({ error: "Not found.", code: "not_found" }, { status: 404 });
}

// OAuth endpoints answer in the format of RFC 6749 and allow requests from any
// origin. They use no cookies, so browser-based MCP tools can call them.
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version",
  "access-control-max-age": "86400",
};

function oauthJson(body: unknown, { status = 200, headers = {} }: { status?: number; headers?: Record<string, string> } = {}): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store", pragma: "no-cache", ...CORS_HEADERS, ...headers } });
}

function oauthErrorResponse(error: unknown): Response {
  if (error instanceof OAuthError) {
    const headers: Record<string, string> = error.error === "invalid_client" && error.status === 401 ? { "www-authenticate": 'Basic realm="daymark"' } : {};
    return oauthJson({ error: error.error, error_description: error.description }, { status: error.status, headers });
  }
  console.error("daymark oauth error", error);
  return oauthJson({ error: "server_error", error_description: "The request could not be completed." }, { status: 500 });
}

/** Read a small form body. The token endpoint also accepts JSON, which some clients send. */
async function readFormBody(request: Request): Promise<URLSearchParams> {
  const text = await readSmallText(request);
  if (text === null) throw new OAuthError(413, "invalid_request", "The request is too large.");
  if (request.headers.get("content-type")?.includes("application/json")) {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new OAuthError(400, "invalid_request", "The request body is not valid JSON.");
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new OAuthError(400, "invalid_request", "The request body must be an object.");
    return new URLSearchParams(Object.entries(value).filter(([, item]) => typeof item === "string") as [string, string][]);
  }
  return new URLSearchParams(text);
}

/** The fields that the consent form posts back. The server checks all of them again. */
function consentFields(request: AuthorizationRequest, params: URLSearchParams): Record<string, string> {
  const fields: Record<string, string> = {
    response_type: "code",
    client_id: request.client.id,
    redirect_uri: request.redirectUri,
    code_challenge: request.codeChallenge,
    code_challenge_method: "S256",
  };
  for (const name of ["state", "scope", "resource"]) {
    const value = params.get(name);
    if (value !== null) fields[name] = value;
  }
  return fields;
}

/** The consent page, the sign-in page first, or the owner's answer. */
async function authorize(context: Context): Promise<Response> {
  const { request, env, url } = context;
  let params = url.searchParams;
  let decision: "allow" | "deny" | null = null;
  if (request.method === "POST") {
    if (!isSameOriginWrite(request)) return renderOAuthErrorPage({ status: 403, message: "The answer must come from the daymark page." });
    const text = await readSmallText(request);
    if (text === null) return renderOAuthErrorPage({ status: 413, message: "The request is too large." });
    params = new URLSearchParams(text);
    decision = params.get("decision") === "allow" ? "allow" : "deny";
    params.delete("decision");
  }
  const check = await checkAuthorizationRequest({ db: env.DB, params, origin: url.origin });
  if (!check.ok) return renderOAuthErrorPage({ status: 400, message: check.description });
  if (!(await readSession(context))) {
    // After sign-in, the sign-in page loads this request again.
    const returnTo = `/oauth/authorize?${params.toString()}`;
    return new Response(null, { status: 303, headers: { location: `/sign-in?returnTo=${encodeURIComponent(returnTo)}`, "cache-control": "no-store" } });
  }
  if (decision === null) {
    return renderConsentPage({
      clientName: check.request.client.name,
      redirectHost: new URL(check.request.redirectUri).host,
      fields: consentFields(check.request, params),
    });
  }
  const location = decision === "allow"
    ? await approveAuthorization({ db: env.DB, request: check.request, origin: url.origin })
    : denyAuthorization({ request: check.request, origin: url.origin });
  return new Response(null, { status: 303, headers: { location, "cache-control": "no-store" } });
}

/** The OAuth routes and discovery documents. Null for a path that is not one of them. */
async function oauthRoute(context: Context, pathname: string): Promise<Response | null> {
  const { request, env, url } = context;
  if (pathname === "/oauth/authorize") {
    if (request.method !== "GET" && request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "GET, POST" } });
    if (skipsSignIn(context)) return renderOAuthErrorPage({ status: 404, message: "Sign-in is off on this local server." });
    try {
      return await authorize(context);
    } catch (error) {
      console.error("daymark oauth authorize error", error);
      return renderOAuthErrorPage({ status: 503, message: "daymark could not check this request." });
    }
  }
  const endpoints: Record<string, { method: "GET" | "POST"; run: () => Promise<Response> }> = {
    // RFC 9728: tells an MCP client which authorization server protects /api/mcp.
    "/.well-known/oauth-protected-resource": { method: "GET", run: async () => oauthJson(protectedResourceMetadata(url.origin)) },
    "/.well-known/oauth-protected-resource/api/mcp": { method: "GET", run: async () => oauthJson(protectedResourceMetadata(url.origin)) },
    "/.well-known/oauth-authorization-server": { method: "GET", run: async () => oauthJson(authorizationServerMetadata(url.origin)) },
    // RFC 7591 dynamic client registration.
    "/oauth/register": {
      method: "POST",
      run: async () => {
        let body: Record<string, unknown>;
        try {
          body = await readJsonObject(request);
        } catch {
          throw new OAuthError(400, "invalid_client_metadata", "The request body must be a JSON object.");
        }
        return oauthJson(await registerClient({ db: env.DB, body, network: await networkKey(request) }), { status: 201 });
      },
    },
    "/oauth/token": {
      method: "POST",
      run: async () => oauthJson(await exchangeToken({ db: env.DB, form: await readFormBody(request), authorization: request.headers.get("authorization") })),
    },
  };
  const endpoint = endpoints[pathname];
  if (!endpoint) return null;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== endpoint.method) return oauthJson({ error: "invalid_request", error_description: `Use ${endpoint.method}.` }, { status: 405, headers: { allow: `${endpoint.method}, OPTIONS` } });
  if (skipsSignIn(context)) return oauthJson({ error: "invalid_request", error_description: "Sign-in is off on this local server." }, { status: 404 });
  try {
    return await endpoint.run();
  } catch (error) {
    return oauthErrorResponse(error);
  }
}

/** An MCP request needs an OAuth access token. A session cookie does not work here. */
async function mcpUnauthorized({ request, env, url }: Context): Promise<Response | null> {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+([A-Za-z0-9_-]+)$/i)?.[1] ?? null;
  if (token && await verifyAccessToken({ db: env.DB, token, origin: url.origin })) return null;
  return authJson(
    { error: "Sign-in is required.", code: "unauthorized" },
    { status: 401, headers: { "www-authenticate": bearerChallenge({ origin: url.origin, invalidToken: token !== null }) } },
  );
}

function withHeader(response: Response, name: string, value: string): Response {
  const copy = new Response(response.body, response);
  copy.headers.append(name, value);
  return copy;
}

/**
 * Answer the sign-in and OAuth routes, and refuse an API request without
 * sign-in. Every other request goes to `next`. Pages and static files do not
 * need sign-in: they hold no journal data, and the app shows the sign-in page
 * when the API answers 401.
 */
export async function withAuth({ request, env, next }: { request: Request; env: AuthEnvironment; next: () => Promise<Response> }): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const context: Context = { request, env, url };

  const oauth = await oauthRoute(context, pathname);
  if (oauth) return oauth;
  if (!pathname.startsWith("/api/")) return next();

  let renewedCookie: string | null = null;
  try {
    if (pathname.startsWith("/api/auth/")) return await authRoute(context, pathname);
    if (!skipsSignIn(context)) {
      if (pathname === "/api/mcp") {
        const refused = await mcpUnauthorized(context);
        if (refused) return refused;
      } else {
        const live = await readSession(context);
        if (!live) {
          const headers: Record<string, string> = readSessionCookie(request) ? { "set-cookie": clearedSessionCookie(url) } : {};
          return authJson({ error: "Sign in to continue.", code: "sign_in_required" }, { status: 401, headers });
        }
        requireSameOrigin(request);
        // A session that moved its end sends its cookie again, so the browser keeps it for another 400 days.
        if (live.renewed) renewedCookie = sessionCookie({ url, token: live.token });
      }
    }
  } catch (error) {
    return authErrorResponse(error);
  }
  const response = await next();
  return renewedCookie ? withHeader(response, "set-cookie", renewedCookie) : response;
}

/** Remove expired sessions, challenges, codes and tokens. The cron trigger runs it. */
export async function deleteExpiredAuthData(db: D1Database): Promise<void> {
  await deleteExpiredAuthRows({ db });
  await deleteExpiredOAuthRows({ db });
}
