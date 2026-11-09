/** Errors, answers and request bodies of the sign-in routes. */

export interface AuthEnvironment {
  DB: D1Database;
  /** The secret that lets a person without a session save a passkey. */
  DAYMARK_SETUP_CODE?: string;
  /** "true" turns sign-in on for requests to localhost, to try passkeys locally. */
  DAYMARK_LOCAL_PASSKEYS?: string;
}

/** An error with the status and code that the client sees. The body has the same shape as the other API errors. */
export class AuthError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "AuthError";
    this.status = status;
    this.code = code;
  }
}

export function authJson(body: unknown, { status = 200, headers = {} }: { status?: number; headers?: Record<string, string> } = {}): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
}

export function authErrorResponse(error: unknown): Response {
  if (error instanceof AuthError) return authJson({ error: error.message, code: error.code }, { status: error.status });
  console.error("daymark auth error", error);
  return authJson({ error: "Sign-in is not available. Try again.", code: "auth_unavailable" }, { status: 503 });
}

const MAX_BODY_BYTES = 20_000;

/** Read a small request body as text, or null when it is larger than `maxBytes`. Nothing larger reaches memory. */
export async function readSmallText(request: Request, maxBytes = MAX_BODY_BYTES): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/** A JSON object body. An empty body is an empty object. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const text = await readSmallText(request);
  if (text === null) throw new AuthError(413, "payload_too_large", "The request is too large.");
  if (!text.trim()) return {};
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new AuthError(400, "invalid_json", "The request body must be valid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AuthError(400, "invalid_json", "The request body must be a JSON object.");
  return value as Record<string, unknown>;
}
