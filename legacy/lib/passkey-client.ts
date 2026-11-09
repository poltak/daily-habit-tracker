// The browser side of passkey sign-in. The sign-in page and the Sign-in
// section of Setup use it. The server sends WebAuthn options as JSON with
// base64url values, and this module turns them into the buffers that
// navigator.credentials needs, and the answer back into JSON.

export type AuthStatus =
  | { mode: "local" }
  | { mode: "passkey"; signedIn: boolean; hasPasskeys: boolean; setupCode: "missing" | "too_short" | "ready" };

export type PasskeyResult = { ok: true } | { ok: false; code: string; message: string };

type Descriptor = { id: string; type: "public-key"; transports?: string[] };
type CreationOptionsJson = { challenge: string; user: { id: string; name: string; displayName: string }; excludeCredentials?: Descriptor[] } & Record<string, unknown>;
type RequestOptionsJson = { challenge: string; allowCredentials?: Descriptor[] } & Record<string, unknown>;
type ApiResult = { ok: boolean; status: number; body: Record<string, unknown> | null };

function fromBase64Url(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer;
}

function toBase64Url(buffer: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function descriptors(list: Descriptor[] | undefined): PublicKeyCredentialDescriptor[] | undefined {
  return list?.map((item) => ({ ...item, id: fromBase64Url(item.id), transports: item.transports as AuthenticatorTransport[] | undefined }));
}

export function supportsPasskeys(): boolean {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential === "function" && typeof navigator.credentials?.create === "function";
}

/** Only a path on this site. Browsers remove tabs and line breaks from addresses, and some treat a backslash as a slash, so those are refused too. */
export function safeReturnTo(value: string | null | undefined): string {
  return value && /^\/(?![/\\])[^\s\\]*$/.test(value) ? value : "/";
}

/** The sign-in page, with the page to open after sign-in. */
export function signInUrl(returnTo: string): string {
  return `/sign-in?returnTo=${encodeURIComponent(returnTo)}`;
}

async function postJson(path: string, body: unknown = {}): Promise<ApiResult> {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  return { ok: response.ok, status: response.status, body: await response.json().catch(() => null) as Record<string, unknown> | null };
}

function codeOf(result: ApiResult): string {
  return typeof result.body?.code === "string" ? result.body.code : "unknown";
}

/** The message for an error code of the sign-in routes. */
export function passkeyErrorMessage(code: string): string {
  switch (code) {
    case "invalid_setup_code": return "This setup code is not correct.";
    case "too_many_attempts": return "Too many wrong setup codes. Wait 15 minutes, then try again.";
    case "setup_code_missing": return "This daymark has no setup code yet. Add the secret DAYMARK_SETUP_CODE to the Worker, then try again.";
    case "setup_code_too_short": return "The setup code is too short. Change the secret DAYMARK_SETUP_CODE to at least 12 characters, then try again.";
    case "challenge_expired": return "The request expired. Try again.";
    case "passkey_unknown": return "This passkey does not belong to this daymark. Use another passkey, or add one with the setup code.";
    case "passkey_exists": return "This device already has a passkey for this daymark.";
    case "passkey_invalid": return "The passkey could not be checked. Try again.";
    case "setup_required": return "No passkey exists yet. Set up daymark with the setup code.";
    case "invalid_origin": return "Open daymark at its own address, then try again.";
    case "network": return "daymark could not be reached. Try again.";
    default: return "Sign-in did not work. Try again.";
  }
}

/** The message for a failed browser passkey request. */
function ceremonyFailure(error: unknown): PasskeyResult {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "AbortError") return { ok: false, code: "cancelled", message: "The passkey request was cancelled or timed out. Try again." };
  if (name === "InvalidStateError") return { ok: false, code: "passkey_exists", message: passkeyErrorMessage("passkey_exists") };
  if (name === "SecurityError") return { ok: false, code: "insecure", message: "This address cannot use passkeys. Open daymark at its HTTPS address." };
  return { ok: false, code: "ceremony_failed", message: "The passkey request did not work. Try again." };
}

function failure(result: ApiResult): PasskeyResult {
  const code = codeOf(result);
  return { ok: false, code, message: passkeyErrorMessage(code) };
}

async function createCredential(options: CreationOptionsJson) {
  const credential = await navigator.credentials.create({
    publicKey: {
      ...options,
      challenge: fromBase64Url(options.challenge),
      user: { ...options.user, id: fromBase64Url(options.user.id) },
      excludeCredentials: descriptors(options.excludeCredentials),
    } as unknown as PublicKeyCredentialCreationOptions,
  }) as PublicKeyCredential;
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: toBase64Url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: toBase64Url(response.clientDataJSON),
      attestationObject: toBase64Url(response.attestationObject),
      transports: response.getTransports?.() ?? [],
    },
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
  };
}

async function getCredential(options: RequestOptionsJson) {
  const credential = await navigator.credentials.get({
    publicKey: {
      ...options,
      challenge: fromBase64Url(options.challenge),
      allowCredentials: descriptors(options.allowCredentials),
    } as unknown as PublicKeyCredentialRequestOptions,
  }) as PublicKeyCredential;
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: toBase64Url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: toBase64Url(response.clientDataJSON),
      authenticatorData: toBase64Url(response.authenticatorData),
      signature: toBase64Url(response.signature),
      userHandle: response.userHandle ? toBase64Url(response.userHandle) : undefined,
    },
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
  };
}

export async function fetchAuthStatus(): Promise<AuthStatus> {
  const response = await fetch("/api/auth/status", { cache: "no-store" });
  if (!response.ok) throw new Error("daymark could not check the sign-in.");
  return await response.json() as AuthStatus;
}

/** Sign in with a passkey of this site. The device asks for a face, a fingerprint or a screen lock. */
export async function signInWithPasskey(): Promise<PasskeyResult> {
  try {
    const options = await postJson("/api/auth/login/options");
    if (!options.ok) return failure(options);
    let response;
    try {
      response = await getCredential(options.body?.options as RequestOptionsJson);
    } catch (error) {
      return ceremonyFailure(error);
    }
    const verified = await postJson("/api/auth/login/verify", { challengeId: options.body?.challengeId, response });
    return verified.ok ? { ok: true } : failure(verified);
  } catch {
    return { ok: false, code: "network", message: passkeyErrorMessage("network") };
  }
}

/**
 * Save a passkey on this device. A signed-in owner needs no setup code.
 * Without a session, the setup code is required, and the new passkey signs the browser in.
 */
export async function addPasskey({ setupCode }: { setupCode?: string } = {}): Promise<PasskeyResult> {
  try {
    const options = await postJson("/api/auth/register/options", setupCode === undefined ? {} : { setupCode });
    if (!options.ok) return failure(options);
    let response;
    try {
      response = await createCredential(options.body?.options as CreationOptionsJson);
    } catch (error) {
      return ceremonyFailure(error);
    }
    const verified = await postJson("/api/auth/register/verify", { challengeId: options.body?.challengeId, response });
    return verified.ok ? { ok: true } : failure(verified);
  } catch {
    return { ok: false, code: "network", message: passkeyErrorMessage("network") };
  }
}

export async function signOut(): Promise<void> {
  await postJson("/api/auth/logout").catch(() => null);
}
