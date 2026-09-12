type AccessClaims = { iss?: string; aud?: string | string[]; exp?: number; nbf?: number; email?: string; kid?: string };

interface AccessEnvironment {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ALLOWED_EMAIL?: string;
}

let jwksCache: { domain: string; fetchedAt: number; expiresAt: number; keys: Array<JsonWebKey & { kid?: string }> } | null = null;

function decodePart(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
}

async function loadAccessKeys({ domain, refresh = false }: { domain: string; refresh?: boolean }) {
  const now = Date.now();
  if (jwksCache?.domain === domain && jwksCache.expiresAt > now && (!refresh || now - jwksCache.fetchedAt < 60_000)) return jwksCache.keys;
  const response = await fetch(`${domain.replace(/\/$/, "")}/cdn-cgi/access/certs`);
  if (!response.ok) throw new Error("Could not retrieve Access signing keys.");
  const body = await response.json() as { keys?: Array<JsonWebKey & { kid?: string }> };
  if (!Array.isArray(body.keys)) throw new Error("Invalid Access signing keys.");
  jwksCache = { domain, keys: body.keys, fetchedAt: now, expiresAt: now + 60 * 60 * 1000 };
  return jwksCache.keys;
}

function isLocalDevelopmentRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

export async function validAccessRequest(request: Request, env: AccessEnvironment) {
  // Local development can run without Access. Any public host must provide
  // all three Access values before API requests are accepted.
  if (!env.ACCESS_TEAM_DOMAIN && !env.ACCESS_AUD && !env.ALLOWED_EMAIL) return isLocalDevelopmentRequest(request);
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.ALLOWED_EMAIL) return false;
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const header = JSON.parse(new TextDecoder().decode(decodePart(parts[0]))) as { kid?: string; alg?: string };
    const claims = JSON.parse(new TextDecoder().decode(decodePart(parts[1]))) as AccessClaims;
    if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid || claims.iss !== env.ACCESS_TEAM_DOMAIN || claims.email !== env.ALLOWED_EMAIL) return false;
    const now = Math.floor(Date.now() / 1000);
    if (typeof claims.exp !== "number" || !Number.isFinite(claims.exp) || claims.exp <= now) return false;
    if (claims.nbf !== undefined && (typeof claims.nbf !== "number" || !Number.isFinite(claims.nbf) || claims.nbf > now)) return false;
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(env.ACCESS_AUD)) return false;
    let key = (await loadAccessKeys({ domain: env.ACCESS_TEAM_DOMAIN })).find((candidate) => candidate.kid === header.kid);
    if (!key) key = (await loadAccessKeys({ domain: env.ACCESS_TEAM_DOMAIN, refresh: true })).find((candidate) => candidate.kid === header.kid);
    if (!key) return false;
    const cryptoKey = await crypto.subtle.importKey("jwk", key, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, cryptoKey, decodePart(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  } catch {
    return false;
  }
}
