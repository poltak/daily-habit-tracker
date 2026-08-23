type AccessClaims = { iss?: string; aud?: string | string[]; exp?: number; nbf?: number; email?: string; kid?: string };

interface AccessEnvironment {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ALLOWED_EMAIL?: string;
}

let jwksCache: { expiresAt: number; keys: Array<JsonWebKey & { kid?: string }> } | null = null;

function decodePart(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
}

async function loadAccessKeys(domain: string) {
  if (jwksCache && jwksCache.expiresAt > Date.now()) return jwksCache.keys;
  const response = await fetch(`${domain.replace(/\/$/, "")}/cdn-cgi/access/certs`);
  if (!response.ok) throw new Error("Could not retrieve Access signing keys.");
  const body = await response.json() as { keys?: Array<JsonWebKey & { kid?: string }> };
  jwksCache = { keys: body.keys ?? [], expiresAt: Date.now() + 60 * 60 * 1000 };
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
    if (header.alg !== "RS256" || claims.iss !== env.ACCESS_TEAM_DOMAIN || claims.email !== env.ALLOWED_EMAIL) return false;
    if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) return false;
    if (claims.nbf && claims.nbf > Math.floor(Date.now() / 1000)) return false;
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.includes(env.ACCESS_AUD)) return false;
    const key = (await loadAccessKeys(env.ACCESS_TEAM_DOMAIN)).find((candidate) => candidate.kid === header.kid);
    if (!key) return false;
    const cryptoKey = await crypto.subtle.importKey("jwk", key, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    return crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, cryptoKey, decodePart(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  } catch {
    return false;
  }
}
