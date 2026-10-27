import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { AuthError } from "./http.ts";
import {
  findPasskey,
  forgetAttempts,
  insertPasskey,
  listPasskeys,
  recordPasskeyUse,
  saveChallenge,
  takeAttempt,
  takeChallenge,
} from "./store.ts";
import { base64UrlDecode, base64UrlEncode, secretsEqual } from "./tokens.ts";

export const SETUP_CODE_MIN_LENGTH = 12;
const SETUP_CODE_WINDOW_MS = 15 * 60 * 1000;
/** Wrong codes that one network can try in the window. */
const SETUP_CODE_MAX_PER_NETWORK = 10;
/** Wrong codes that all networks together can try in the window. */
const SETUP_CODE_MAX_TOTAL = 50;
/** The browser waits this long for the owner. The challenge lives five minutes. */
const CEREMONY_TIMEOUT_MS = 3 * 60 * 1000;
/** The WebAuthn user of the one owner. A stable ID lets a device replace its old passkey for this site instead of keeping two. */
const USER_ID = new TextEncoder().encode("daymark-owner");

/** The site that a passkey belongs to. A passkey made on one host name does not work on another. */
export type RelyingParty = { rpID: string; origin: string };

export function relyingParty(request: Request): RelyingParty {
  const url = new URL(request.url);
  return { rpID: url.hostname, origin: url.origin };
}

export type SetupCodeState = "missing" | "too_short" | "ready";

export function setupCodeState(configured: string | undefined): SetupCodeState {
  const code = configured?.trim() ?? "";
  if (!code) return "missing";
  return code.length < SETUP_CODE_MIN_LENGTH ? "too_short" : "ready";
}

/**
 * Check the setup code that lets a person add a passkey without a session.
 * Each network has a limit of wrong codes, and all networks together have a
 * higher one, so guessing a long code is not practical and one network cannot
 * lock the owner out. A correct code does not count.
 */
export async function checkSetupCode({ db, configured, given, network, now = Date.now() }: {
  db: D1Database;
  configured: string | undefined;
  given: unknown;
  /** The `networkKey` of the request. */
  network: string;
  now?: number;
}): Promise<void> {
  const state = setupCodeState(configured);
  if (state === "missing") {
    throw new AuthError(503, "setup_code_missing", "This daymark has no setup code. Add the secret DAYMARK_SETUP_CODE to the Worker.");
  }
  if (state === "too_short") {
    throw new AuthError(503, "setup_code_too_short", `The setup code must have at least ${SETUP_CODE_MIN_LENGTH} characters. Change the secret DAYMARK_SETUP_CODE.`);
  }
  const attempt = await takeAttempt({
    db,
    limits: [
      { kind: `setup_code:${network}`, max: SETUP_CODE_MAX_PER_NETWORK, windowMs: SETUP_CODE_WINDOW_MS },
      { kind: "setup_code", max: SETUP_CODE_MAX_TOTAL, windowMs: SETUP_CODE_WINDOW_MS },
    ],
    now,
  });
  if (!attempt) {
    throw new AuthError(429, "too_many_attempts", "Too many wrong setup codes. Wait 15 minutes, then try again.");
  }
  if (typeof given !== "string" || given.length > 500 || !(await secretsEqual(given.trim(), configured!.trim()))) {
    throw new AuthError(403, "invalid_setup_code", "The setup code is not correct.");
  }
  await forgetAttempts({ db, ids: attempt });
}

/** A short name for a new passkey, from the device that made it. The owner sees it in Setup. */
export function passkeyName(userAgent: string | null): string {
  const agent = userAgent ?? "";
  if (/iPhone/.test(agent)) return "iPhone";
  if (/iPad/.test(agent)) return "iPad";
  if (/Android/.test(agent)) return "Android device";
  if (/Macintosh|Mac OS X/.test(agent)) return "Mac";
  if (/Windows/.test(agent)) return "Windows computer";
  if (/CrOS/.test(agent)) return "Chromebook";
  if (/Linux/.test(agent)) return "Linux computer";
  return "Passkey";
}

function transportsOf(json: string): AuthenticatorTransport[] {
  try {
    const value = JSON.parse(json) as unknown;
    return Array.isArray(value) ? value.filter((item): item is AuthenticatorTransport => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function challengeIdOf(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{20,100}$/.test(value)) {
    throw new AuthError(400, "invalid_field", "challengeId is not valid.");
  }
  return value;
}

function credentialResponseOf<T>(value: unknown): T {
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof (value as { id?: unknown }).id !== "string") {
    throw new AuthError(400, "invalid_field", "response must be a passkey response.");
  }
  return value as T;
}

export async function startPasskeyRegistration({ db, rp, now = Date.now() }: {
  db: D1Database;
  rp: RelyingParty;
  now?: number;
}): Promise<{ options: PublicKeyCredentialCreationOptionsJSON; challengeId: string }> {
  const existing = await listPasskeys({ db });
  const options = await generateRegistrationOptions({
    rpName: "daymark",
    rpID: rp.rpID,
    userName: "daymark",
    userDisplayName: "daymark owner",
    userID: USER_ID,
    timeout: CEREMONY_TIMEOUT_MS,
    attestationType: "none",
    excludeCredentials: existing.map((passkey) => ({ id: passkey.id, transports: transportsOf(passkey.transportsJson) })),
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  const challengeId = await saveChallenge({ db, purpose: "registration", challenge: options.challenge, now });
  return { options, challengeId };
}

export async function finishPasskeyRegistration({ db, rp, body, userAgent, now = Date.now() }: {
  db: D1Database;
  rp: RelyingParty;
  body: Record<string, unknown>;
  userAgent: string | null;
  now?: number;
}): Promise<{ id: string; name: string }> {
  const challengeId = challengeIdOf(body.challengeId);
  const response = credentialResponseOf<RegistrationResponseJSON>(body.response);
  const challenge = await takeChallenge({ db, id: challengeId, purpose: "registration", now });
  if (!challenge) throw new AuthError(400, "challenge_expired", "The passkey request expired. Try again.");

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
    });
  } catch {
    throw new AuthError(400, "passkey_invalid", "The passkey could not be checked. Try again.");
  }
  if (!verification.verified) throw new AuthError(400, "passkey_invalid", "The passkey could not be checked. Try again.");

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  if (await findPasskey({ db, id: credential.id })) {
    throw new AuthError(409, "passkey_exists", "This passkey is already saved.");
  }
  const name = passkeyName(userAgent);
  await insertPasskey({
    db,
    passkey: {
      id: credential.id,
      publicKey: base64UrlEncode(credential.publicKey),
      counter: credential.counter,
      transportsJson: JSON.stringify(credential.transports ?? []),
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      name,
      createdAt: now,
    },
  });
  return { id: credential.id, name };
}

export async function startPasskeySignIn({ db, rp, now = Date.now() }: {
  db: D1Database;
  rp: RelyingParty;
  now?: number;
}): Promise<{ options: PublicKeyCredentialRequestOptionsJSON; challengeId: string }> {
  const existing = await listPasskeys({ db });
  if (existing.length === 0) {
    throw new AuthError(409, "setup_required", "No passkey exists yet. Set up daymark with the setup code.");
  }
  // Every passkey is a resident key, so the browser finds it without a list.
  // An empty list also keeps the credential IDs from anonymous visitors.
  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    timeout: CEREMONY_TIMEOUT_MS,
    userVerification: "required",
  });
  const challengeId = await saveChallenge({ db, purpose: "authentication", challenge: options.challenge, now });
  return { options, challengeId };
}

/** Check a passkey answer and return the passkey that signed in. */
export async function finishPasskeySignIn({ db, rp, body, now = Date.now() }: {
  db: D1Database;
  rp: RelyingParty;
  body: Record<string, unknown>;
  now?: number;
}): Promise<{ id: string }> {
  const challengeId = challengeIdOf(body.challengeId);
  const response = credentialResponseOf<AuthenticationResponseJSON>(body.response);
  const challenge = await takeChallenge({ db, id: challengeId, purpose: "authentication", now });
  if (!challenge) throw new AuthError(400, "challenge_expired", "The sign-in request expired. Try again.");

  const passkey = await findPasskey({ db, id: response.id });
  if (!passkey) throw new AuthError(400, "passkey_unknown", "This passkey does not belong to this daymark.");

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      credential: {
        id: passkey.id,
        publicKey: base64UrlDecode(passkey.publicKey),
        counter: passkey.counter,
        transports: transportsOf(passkey.transportsJson),
      },
      requireUserVerification: true,
    });
  } catch {
    throw new AuthError(400, "passkey_invalid", "The passkey could not be checked. Try again.");
  }
  if (!verification.verified) throw new AuthError(400, "passkey_invalid", "The passkey could not be checked. Try again.");

  await recordPasskeyUse({
    db,
    id: passkey.id,
    counter: verification.authenticationInfo.newCounter,
    backedUp: verification.authenticationInfo.credentialBackedUp,
    now,
  });
  return { id: passkey.id };
}
