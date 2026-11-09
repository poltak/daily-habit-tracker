import { takeAttempt } from "./store.ts";
import { randomToken, secretsEqual, sha256Base64Url, sha256Hex } from "./tokens.ts";

// A small OAuth 2.1 authorization server for the MCP endpoint: discovery
// documents (RFC 8414, RFC 9728), dynamic client registration (RFC 7591), the
// authorization code grant with PKCE S256, refresh tokens, and the `iss`
// authorization response parameter (RFC 9207). Tokens are random values. The
// database keeps only their SHA-256. The rules are the same as in calocount
// (app/auth/oauth.ts).

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
export const ACCESS_TOKEN_TTL_MS = 60 * MINUTE_MS;
export const REFRESH_TOKEN_TTL_MS = 180 * DAY_MS;
const CODE_TTL_MS = 5 * MINUTE_MS;
/** A rotated refresh token keeps working this long, so a client that lost the response can retry. */
const REFRESH_GRACE_MS = 2 * MINUTE_MS;
const REGISTRATION_WINDOW_MS = 60 * MINUTE_MS;
/** Registrations that one network can make in an hour. A client registers once for each connection. */
const MAX_REGISTRATIONS_PER_NETWORK = 10;
const MAX_REGISTRATIONS_TOTAL = 200;
const AUTH_METHODS = ["none", "client_secret_post", "client_secret_basic"] as const;
type AuthMethod = (typeof AUTH_METHODS)[number];

export type OauthClient = {
  id: string;
  secretHash: string | null;
  name: string;
  redirectUrisJson: string;
  tokenEndpointAuthMethod: string;
  createdAt: number;
  approvedAt: number | null;
};

type Grant = { id: string; clientId: string; scope: string; resource: string };

const CLIENT_COLUMNS = "id, secret_hash AS secretHash, name, redirect_uris_json AS redirectUrisJson, token_endpoint_auth_method AS tokenEndpointAuthMethod, created_at AS createdAt, approved_at AS approvedAt";
const GRANT_COLUMNS = "id, client_id AS clientId, scope, resource";

export class OAuthError extends Error {
  readonly status: number;
  readonly error: string;
  readonly description: string;

  constructor(status: number, error: string, description: string) {
    super(description);
    this.name = "OAuthError";
    this.status = status;
    this.error = error;
    this.description = description;
  }
}

export function oauthUrls(origin: string) {
  return {
    issuer: origin,
    resource: `${origin}/api/mcp`,
    authorizationEndpoint: `${origin}/oauth/authorize`,
    tokenEndpoint: `${origin}/oauth/token`,
    registrationEndpoint: `${origin}/oauth/register`,
    resourceMetadata: `${origin}/.well-known/oauth-protected-resource/api/mcp`,
  };
}

export function protectedResourceMetadata(origin: string) {
  const urls = oauthUrls(origin);
  return {
    resource: urls.resource,
    authorization_servers: [urls.issuer],
    bearer_methods_supported: ["header"],
    resource_name: "daymark",
  };
}

export function authorizationServerMetadata(origin: string) {
  const urls = oauthUrls(origin);
  return {
    issuer: urls.issuer,
    authorization_endpoint: urls.authorizationEndpoint,
    token_endpoint: urls.tokenEndpoint,
    registration_endpoint: urls.registrationEndpoint,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: [...AUTH_METHODS],
    authorization_response_iss_parameter_supported: true,
  };
}

/** The `WWW-Authenticate` value that sends an MCP client to the discovery documents. */
export function bearerChallenge({ origin, invalidToken }: { origin: string; invalidToken: boolean }): string {
  const error = invalidToken ? `, error="invalid_token", error_description="The access token is not valid."` : "";
  return `Bearer resource_metadata="${oauthUrls(origin).resourceMetadata}"${error}`;
}

/** HTTPS, or HTTP on this computer for local tools. No fragment, and no user name or password. */
function isAllowedRedirectUri(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2000) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  // Remove control characters, so a name cannot break the consent page layout.
  const text = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return text ? text.slice(0, maxLength) : null;
}

async function findClient({ db, id }: { db: D1Database; id: string | null }): Promise<OauthClient | null> {
  if (!id || id.length > 100) return null;
  return db.prepare(`SELECT ${CLIENT_COLUMNS} FROM oauth_clients WHERE id = ? LIMIT 1`).bind(id).first<OauthClient>();
}

async function findGrant({ db, id }: { db: D1Database; id: string }): Promise<Grant | null> {
  return db.prepare(`SELECT ${GRANT_COLUMNS} FROM oauth_grants WHERE id = ? LIMIT 1`).bind(id).first<Grant>();
}

/** Register a client (RFC 7591). The response carries the only copy of a client secret. */
export async function registerClient({ db, body, network, now = Date.now() }: {
  db: D1Database;
  body: Record<string, unknown>;
  /** The `networkKey` of the request, for the rate limit. */
  network: string;
  now?: number;
}) {
  const redirectUris = body.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0 || redirectUris.length > 10 || !redirectUris.every(isAllowedRedirectUri)) {
    throw new OAuthError(400, "invalid_redirect_uri", "redirect_uris must be 1 to 10 HTTPS URLs, or HTTP URLs on localhost.");
  }
  const requestedMethod = body.token_endpoint_auth_method ?? "client_secret_basic";
  if (!AUTH_METHODS.includes(requestedMethod as AuthMethod)) {
    throw new OAuthError(400, "invalid_client_metadata", `token_endpoint_auth_method must be one of: ${AUTH_METHODS.join(", ")}.`);
  }
  const method = requestedMethod as AuthMethod;
  const grantTypes = body.grant_types ?? ["authorization_code", "refresh_token"];
  if (!Array.isArray(grantTypes) || !grantTypes.every((type) => type === "authorization_code" || type === "refresh_token")) {
    throw new OAuthError(400, "invalid_client_metadata", "grant_types may contain only authorization_code and refresh_token.");
  }
  const responseTypes = body.response_types ?? ["code"];
  if (!Array.isArray(responseTypes) || !responseTypes.every((type) => type === "code")) {
    throw new OAuthError(400, "invalid_client_metadata", "response_types may contain only code.");
  }

  const attempt = await takeAttempt({
    db,
    limits: [
      { kind: `oauth_register:${network}`, max: MAX_REGISTRATIONS_PER_NETWORK, windowMs: REGISTRATION_WINDOW_MS },
      { kind: "oauth_register", max: MAX_REGISTRATIONS_TOTAL, windowMs: REGISTRATION_WINDOW_MS },
    ],
    now,
  });
  if (!attempt) throw new OAuthError(429, "temporarily_unavailable", "Too many client registrations. Try again later.");
  const clientId = `dmc_${randomToken(16)}`;
  const clientSecret = method === "none" ? null : `dms_${randomToken()}`;
  const name = cleanText(body.client_name, 100) ?? "An unnamed app";
  await db.prepare("INSERT INTO oauth_clients (id, secret_hash, name, redirect_uris_json, token_endpoint_auth_method, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(clientId, clientSecret ? await sha256Hex(clientSecret) : null, name, JSON.stringify(redirectUris), method, now).run();
  return {
    client_id: clientId,
    ...(clientSecret ? { client_secret: clientSecret, client_secret_expires_at: 0 } : {}),
    client_id_issued_at: Math.floor(now / 1000),
    client_name: name,
    redirect_uris: redirectUris,
    token_endpoint_auth_method: method,
    grant_types: grantTypes,
    response_types: ["code"],
  };
}

function redirectUrisOf(client: OauthClient): string[] {
  try {
    const value = JSON.parse(client.redirectUrisJson) as unknown;
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/** The statements that remove one connection with its codes and tokens. */
function deleteGrantStatements(db: D1Database, grantId: string) {
  return [
    db.prepare("DELETE FROM oauth_tokens WHERE grant_id = ?").bind(grantId),
    db.prepare("DELETE FROM oauth_codes WHERE grant_id = ?").bind(grantId),
    db.prepare("DELETE FROM oauth_grants WHERE id = ?").bind(grantId),
  ];
}

export type AuthorizationRequest = {
  client: OauthClient;
  redirectUri: string;
  state: string | null;
  codeChallenge: string;
  scope: string;
  resource: string;
};

/**
 * The result of checking an authorization request. Every error shows on the
 * daymark page and never redirects. Anyone can register a client with any
 * HTTPS redirect URI, so an error redirect would let a link on this site send
 * a visitor to another site (RFC 9700 section 4.11.2).
 */
export type AuthorizationRequestCheck =
  | { ok: true; request: AuthorizationRequest }
  | { ok: false; description: string };

/** Add the response parameters and the issuer to a redirect URI. */
function redirectWith(redirectUri: string, origin: string, params: Record<string, string | null>): string {
  const url = new URL(redirectUri);
  for (const [name, value] of Object.entries(params)) {
    if (value !== null) url.searchParams.set(name, value);
  }
  url.searchParams.set("iss", oauthUrls(origin).issuer);
  return url.toString();
}

export async function checkAuthorizationRequest({ db, params, origin }: {
  db: D1Database;
  params: URLSearchParams;
  origin: string;
}): Promise<AuthorizationRequestCheck> {
  const client = await findClient({ db, id: params.get("client_id") });
  if (!client) return { ok: false, description: "This app is not registered with daymark." };

  const registered = redirectUrisOf(client);
  const requestedRedirect = params.get("redirect_uri");
  const redirectUri = requestedRedirect ?? (registered.length === 1 ? registered[0] : null);
  if (!redirectUri || !registered.includes(redirectUri)) {
    return { ok: false, description: "The app asked to return to an address that it did not register." };
  }

  const state = params.get("state");
  if (params.get("response_type") !== "code") return { ok: false, description: "The app asked for an unsupported response type." };
  const codeChallenge = params.get("code_challenge") ?? "";
  if (params.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)) {
    return { ok: false, description: "The app did not use PKCE with the S256 method." };
  }
  const resource = params.get("resource");
  const expectedResource = oauthUrls(origin).resource;
  if (resource !== null && resource.replace(/\/$/, "") !== expectedResource) {
    return { ok: false, description: `The app asked for another resource. Use ${expectedResource}.` };
  }
  return {
    ok: true,
    request: {
      client,
      redirectUri,
      state,
      codeChallenge,
      scope: cleanText(params.get("scope"), 200) ?? "",
      resource: expectedResource,
    },
  };
}

/**
 * Record the owner's approval and return the redirect that carries the code.
 * An earlier approval of the same app ends, so each app has one connection.
 */
export async function approveAuthorization({ db, request, origin, now = Date.now() }: {
  db: D1Database;
  request: AuthorizationRequest;
  origin: string;
  now?: number;
}): Promise<string> {
  const grantId = `dmg_${randomToken(16)}`;
  const code = randomToken();
  const { results: previous } = await db.prepare("SELECT id FROM oauth_grants WHERE client_id = ?").bind(request.client.id).all<{ id: string }>();
  // Different IDs, so the order of the new rows and the removals does not matter.
  await db.batch([
    db.prepare("INSERT INTO oauth_grants (id, client_id, scope, resource, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(grantId, request.client.id, request.scope, request.resource, now),
    db.prepare("INSERT INTO oauth_codes (id, grant_id, client_id, redirect_uri, code_challenge, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(await sha256Hex(code), grantId, request.client.id, request.redirectUri, request.codeChallenge, now, now + CODE_TTL_MS),
    db.prepare("UPDATE oauth_clients SET approved_at = ? WHERE id = ?").bind(now, request.client.id),
    ...previous.flatMap(({ id }) => deleteGrantStatements(db, id)),
  ]);
  return redirectWith(request.redirectUri, origin, { code, state: request.state });
}

export function denyAuthorization({ request, origin }: { request: AuthorizationRequest; origin: string }): string {
  return redirectWith(request.redirectUri, origin, {
    error: "access_denied",
    error_description: "The owner did not allow this app.",
    state: request.state,
  });
}

function decodeFormComponent(value: string): string {
  return decodeURIComponent(value.replace(/\+/g, " "));
}

/** The client of a token request, after it proves who it is (RFC 6749 section 2.3). */
async function authenticateClient({ db, form, authorization }: {
  db: D1Database;
  form: URLSearchParams;
  authorization: string | null;
}): Promise<OauthClient> {
  let clientId = form.get("client_id");
  let secret = form.get("client_secret");
  if (authorization?.toLowerCase().startsWith("basic ")) {
    let headerClientId: string;
    try {
      const decoded = atob(authorization.slice(6).trim());
      const separator = decoded.indexOf(":");
      if (separator < 0) throw new Error("no separator");
      headerClientId = decodeFormComponent(decoded.slice(0, separator));
      secret = decodeFormComponent(decoded.slice(separator + 1));
    } catch {
      throw new OAuthError(401, "invalid_client", "The client credentials are not valid.");
    }
    if (clientId !== null && clientId !== headerClientId) {
      throw new OAuthError(400, "invalid_request", "client_id in the body differs from the Authorization header.");
    }
    clientId = headerClientId;
  }
  const client = await findClient({ db, id: clientId });
  if (!client) throw new OAuthError(401, "invalid_client", "The client is not registered.");
  if (client.secretHash) {
    // A confidential client may send its secret in the header or in the body.
    if (!secret || !(await secretsEqual(await sha256Hex(secret), client.secretHash))) {
      throw new OAuthError(401, "invalid_client", "The client credentials are not valid.");
    }
  }
  return client;
}

async function issueTokens({ db, grantId, clientId, refreshToken, now }: {
  db: D1Database;
  grantId: string;
  clientId: string;
  /** Keep this refresh token. Without it, a new one is made. */
  refreshToken: string | null;
  now: number;
}) {
  const accessToken = `dma_${randomToken()}`;
  const nextRefreshToken = refreshToken ?? `dmr_${randomToken()}`;
  const insertToken = "INSERT INTO oauth_tokens (id, kind, grant_id, client_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)";
  await db.batch([
    db.prepare(insertToken).bind(await sha256Hex(accessToken), "access", grantId, clientId, now, now + ACCESS_TOKEN_TTL_MS),
    refreshToken
      ? db.prepare("UPDATE oauth_tokens SET expires_at = ? WHERE id = ?").bind(now + REFRESH_TOKEN_TTL_MS, await sha256Hex(refreshToken))
      : db.prepare(insertToken).bind(await sha256Hex(nextRefreshToken), "refresh", grantId, clientId, now, now + REFRESH_TOKEN_TTL_MS),
  ]);
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    refresh_token: nextRefreshToken,
  };
}

function checkResource(form: URLSearchParams, grantResource: string): void {
  const resource = form.get("resource");
  if (resource !== null && resource.replace(/\/$/, "") !== grantResource) {
    throw new OAuthError(400, "invalid_target", `resource must be ${grantResource}.`);
  }
}

/** Answer a token request (RFC 6749 section 3.2) with the authorization code or the refresh token grant. */
export async function exchangeToken({ db, form, authorization, now = Date.now() }: {
  db: D1Database;
  form: URLSearchParams;
  authorization: string | null;
  now?: number;
}) {
  const client = await authenticateClient({ db, form, authorization });
  const grantType = form.get("grant_type");

  if (grantType === "authorization_code") {
    const code = form.get("code");
    const verifier = form.get("code_verifier");
    if (!code || code.length > 200) throw new OAuthError(400, "invalid_request", "code is required.");
    if (!verifier || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) {
      throw new OAuthError(400, "invalid_request", "code_verifier is required and must have 43 to 128 characters.");
    }
    // Remove the code first, so it works once even when the rest of the request fails.
    const stored = await db.prepare("DELETE FROM oauth_codes WHERE id = ? RETURNING grant_id AS grantId, client_id AS clientId, redirect_uri AS redirectUri, code_challenge AS codeChallenge, expires_at AS expiresAt")
      .bind(await sha256Hex(code)).first<{ grantId: string; clientId: string; redirectUri: string; codeChallenge: string; expiresAt: number }>();
    if (!stored || stored.expiresAt <= now || stored.clientId !== client.id) {
      throw new OAuthError(400, "invalid_grant", "The authorization code is not valid.");
    }
    const redirectUri = form.get("redirect_uri");
    if (redirectUri !== null && redirectUri !== stored.redirectUri) {
      throw new OAuthError(400, "invalid_grant", "redirect_uri does not match the authorization request.");
    }
    if (await sha256Base64Url(verifier) !== stored.codeChallenge) {
      throw new OAuthError(400, "invalid_grant", "code_verifier does not match the code challenge.");
    }
    const grant = await findGrant({ db, id: stored.grantId });
    if (!grant) throw new OAuthError(400, "invalid_grant", "The owner removed this connection.");
    checkResource(form, grant.resource);
    return { ...(await issueTokens({ db, grantId: grant.id, clientId: client.id, refreshToken: null, now })), ...(grant.scope ? { scope: grant.scope } : {}) };
  }

  if (grantType === "refresh_token") {
    const refreshToken = form.get("refresh_token");
    if (!refreshToken || refreshToken.length > 200) throw new OAuthError(400, "invalid_request", "refresh_token is required.");
    const id = await sha256Hex(refreshToken);
    const stored = await db.prepare("SELECT grant_id AS grantId, client_id AS clientId, expires_at AS expiresAt FROM oauth_tokens WHERE id = ? AND kind = 'refresh' AND expires_at > ? LIMIT 1")
      .bind(id, now).first<{ grantId: string; clientId: string; expiresAt: number }>();
    if (!stored || stored.clientId !== client.id) throw new OAuthError(400, "invalid_grant", "The refresh token is not valid.");
    const grant = await findGrant({ db, id: stored.grantId });
    if (!grant) throw new OAuthError(400, "invalid_grant", "The owner removed this connection.");
    checkResource(form, grant.resource);
    // OAuth 2.1 requires a new refresh token for a public client. A confidential client keeps its token.
    const rotate = client.secretHash === null;
    if (rotate) {
      await db.prepare("UPDATE oauth_tokens SET expires_at = ? WHERE id = ?").bind(Math.min(stored.expiresAt, now + REFRESH_GRACE_MS), id).run();
    }
    return {
      ...(await issueTokens({ db, grantId: grant.id, clientId: client.id, refreshToken: rotate ? null : refreshToken, now })),
      ...(grant.scope ? { scope: grant.scope } : {}),
    };
  }

  throw new OAuthError(400, "unsupported_grant_type", "grant_type must be authorization_code or refresh_token.");
}

/** True for a valid access token of this MCP endpoint. */
export async function verifyAccessToken({ db, token, origin, now = Date.now() }: {
  db: D1Database;
  token: string;
  origin: string;
  now?: number;
}): Promise<boolean> {
  if (token.length > 200) return false;
  const row = await db.prepare(`SELECT oauth_grants.id AS grantId, oauth_grants.resource AS resource, oauth_grants.last_used_at AS lastUsedAt
    FROM oauth_tokens INNER JOIN oauth_grants ON oauth_grants.id = oauth_tokens.grant_id
    WHERE oauth_tokens.id = ? AND oauth_tokens.kind = 'access' AND oauth_tokens.expires_at > ? LIMIT 1`)
    .bind(await sha256Hex(token), now).first<{ grantId: string; resource: string; lastUsedAt: number | null }>();
  if (!row || row.resource !== oauthUrls(origin).resource) return false;
  if (row.lastUsedAt === null || now - row.lastUsedAt > 60 * MINUTE_MS) {
    await db.prepare("UPDATE oauth_grants SET last_used_at = ? WHERE id = ?").bind(now, row.grantId).run();
  }
  return true;
}

/** The apps that the owner connected, newest first. */
export async function listConnections({ db }: { db: D1Database }) {
  const { results } = await db.prepare(`SELECT oauth_grants.id AS id, oauth_clients.name AS name, oauth_grants.created_at AS createdAt, oauth_grants.last_used_at AS lastUsedAt
    FROM oauth_grants INNER JOIN oauth_clients ON oauth_clients.id = oauth_grants.client_id
    ORDER BY oauth_grants.created_at DESC`).all<{ id: string; name: string; createdAt: number; lastUsedAt: number | null }>();
  return results;
}

/** Remove a connection and stop all of its tokens. */
export async function removeConnection({ db, id }: { db: D1Database; id: string }): Promise<boolean> {
  if (!(await findGrant({ db, id }))) return false;
  await db.batch(deleteGrantStatements(db, id));
  return true;
}

/**
 * Remove expired codes and tokens, connections without a working refresh
 * token, and registered clients that the owner never allowed within a day. A
 * client that the owner allowed once stays, because some clients keep their
 * client ID and use it again after a disconnect.
 */
export async function deleteExpiredOAuthRows({ db, now = Date.now() }: { db: D1Database; now?: number }): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM oauth_codes WHERE expires_at <= ?").bind(now),
    db.prepare("DELETE FROM oauth_tokens WHERE expires_at <= ?").bind(now),
    db.prepare(`DELETE FROM oauth_grants WHERE created_at < ? AND NOT EXISTS (
      SELECT 1 FROM oauth_tokens WHERE oauth_tokens.grant_id = oauth_grants.id AND oauth_tokens.kind = 'refresh')`).bind(now - DAY_MS),
    db.prepare("DELETE FROM oauth_clients WHERE approved_at IS NULL AND created_at < ?").bind(now - DAY_MS),
  ]);
}
