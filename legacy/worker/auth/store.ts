import { randomToken, sha256Hex } from "./tokens.ts";

// The SQL of passkeys, sessions, challenges and rate limits. The function names
// and rules are the same as in calocount (app/auth/store.ts), which uses one
// owner key per row. Daymark has one owner, so its tables have no owner key.

const DAY_MS = 24 * 60 * 60 * 1000;
/** A session that nobody uses for this long ends. Each use moves the end. */
export const SESSION_IDLE_TTL_MS = 180 * DAY_MS;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export type ChallengePurpose = "registration" | "authentication";

export type Session = { id: string; passkeyId: string | null; createdAt: number; lastSeenAt: number; expiresAt: number };

export type Passkey = {
  id: string;
  publicKey: string;
  counter: number;
  transportsJson: string;
  deviceType: string;
  backedUp: boolean;
  name: string;
  createdAt: number;
  lastUsedAt: number | null;
};

type PasskeyRow = Omit<Passkey, "backedUp"> & { backedUp: number };

const PASSKEY_COLUMNS = "id, public_key AS publicKey, counter, transports_json AS transportsJson, device_type AS deviceType, backed_up AS backedUp, name, created_at AS createdAt, last_used_at AS lastUsedAt";

function passkeyFromRow(row: PasskeyRow): Passkey {
  return { ...row, backedUp: Boolean(row.backedUp) };
}

export async function createSession({ db, passkeyId, now = Date.now() }: { db: D1Database; passkeyId: string | null; now?: number }): Promise<string> {
  const token = randomToken();
  await db.prepare("INSERT INTO auth_sessions (id, passkey_id, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?)")
    .bind(await sha256Hex(token), passkeyId, now, now, now + SESSION_IDLE_TTL_MS).run();
  return token;
}

/**
 * The live session of a cookie token, or null. A session that was last seen
 * more than a day ago gets a new end, so an owner who uses the app stays
 * signed in. `renewed` tells the caller to send the cookie again.
 */
export async function findSession({ db, token, now = Date.now() }: { db: D1Database; token: string; now?: number }): Promise<{ session: Session; renewed: boolean } | null> {
  const id = await sha256Hex(token);
  const session = await db.prepare("SELECT id, passkey_id AS passkeyId, created_at AS createdAt, last_seen_at AS lastSeenAt, expires_at AS expiresAt FROM auth_sessions WHERE id = ? AND expires_at > ? LIMIT 1")
    .bind(id, now).first<Session>();
  if (!session) return null;
  if (now - session.lastSeenAt <= DAY_MS) return { session, renewed: false };
  await db.prepare("UPDATE auth_sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?").bind(now, now + SESSION_IDLE_TTL_MS, id).run();
  return { session: { ...session, lastSeenAt: now, expiresAt: now + SESSION_IDLE_TTL_MS }, renewed: true };
}

export async function deleteSession({ db, token }: { db: D1Database; token: string }): Promise<void> {
  await db.prepare("DELETE FROM auth_sessions WHERE id = ?").bind(await sha256Hex(token)).run();
}

/** Store a challenge for one answer, and return the ID the browser sends back with that answer. */
export async function saveChallenge({ db, purpose, challenge, now = Date.now() }: {
  db: D1Database;
  purpose: ChallengePurpose;
  challenge: string;
  now?: number;
}): Promise<string> {
  const id = randomToken();
  await db.prepare("INSERT INTO auth_challenges (id, purpose, challenge, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, purpose, challenge, now, now + CHALLENGE_TTL_MS).run();
  return id;
}

/** Remove a challenge and return it. A challenge works once, and only before it expires. */
export async function takeChallenge({ db, id, purpose, now = Date.now() }: {
  db: D1Database;
  id: string;
  purpose: ChallengePurpose;
  now?: number;
}): Promise<string | null> {
  const row = await db.prepare("DELETE FROM auth_challenges WHERE id = ? AND purpose = ? RETURNING challenge, expires_at AS expiresAt")
    .bind(id, purpose).first<{ challenge: string; expiresAt: number }>();
  return row && row.expiresAt > now ? row.challenge : null;
}

export async function listPasskeys({ db }: { db: D1Database }): Promise<Passkey[]> {
  const { results } = await db.prepare(`SELECT ${PASSKEY_COLUMNS} FROM passkeys ORDER BY created_at`).all<PasskeyRow>();
  return results.map(passkeyFromRow);
}

export async function findPasskey({ db, id }: { db: D1Database; id: string }): Promise<Passkey | null> {
  const row = await db.prepare(`SELECT ${PASSKEY_COLUMNS} FROM passkeys WHERE id = ? LIMIT 1`).bind(id).first<PasskeyRow>();
  return row ? passkeyFromRow(row) : null;
}

export async function countPasskeys({ db }: { db: D1Database }): Promise<number> {
  return (await db.prepare("SELECT count(*) AS value FROM passkeys").first<{ value: number }>())?.value ?? 0;
}

export async function insertPasskey({ db, passkey }: { db: D1Database; passkey: Omit<Passkey, "lastUsedAt"> }): Promise<void> {
  await db.prepare("INSERT INTO passkeys (id, public_key, counter, transports_json, device_type, backed_up, name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(passkey.id, passkey.publicKey, passkey.counter, passkey.transportsJson, passkey.deviceType, passkey.backedUp ? 1 : 0, passkey.name, passkey.createdAt).run();
}

export async function recordPasskeyUse({ db, id, counter, backedUp, now = Date.now() }: {
  db: D1Database;
  id: string;
  counter: number;
  backedUp: boolean;
  now?: number;
}): Promise<void> {
  await db.prepare("UPDATE passkeys SET counter = ?, backed_up = ?, last_used_at = ? WHERE id = ?").bind(counter, backedUp ? 1 : 0, now, id).run();
}

/**
 * Remove a passkey and end the sessions that it signed in. The last passkey
 * stays: the count is part of the same statement, so two parallel removals
 * cannot remove the last two passkeys.
 */
export async function deletePasskey({ db, id }: { db: D1Database; id: string }): Promise<"removed" | "last" | "missing"> {
  const removed = await db.prepare("DELETE FROM passkeys WHERE id = ? AND (SELECT count(*) FROM passkeys) > 1 RETURNING id").bind(id).first<{ id: string }>();
  if (!removed) return (await findPasskey({ db, id })) ? "last" : "missing";
  await db.prepare("DELETE FROM auth_sessions WHERE passkey_id = ?").bind(id).run();
  return "removed";
}

export type AttemptLimit = { kind: string; max: number; windowMs: number };

/**
 * Count one attempt against each limit before the caller checks it. The rows
 * go in first, so parallel requests cannot pass a limit together. A refused
 * attempt removes its rows again, so refused requests do not use up a shared
 * limit. Returns the IDs of the rows, or null when a limit is reached.
 */
export async function takeAttempt({ db, limits, now = Date.now() }: {
  db: D1Database;
  limits: AttemptLimit[];
  now?: number;
}): Promise<string[] | null> {
  const rows = limits.map((limit) => ({ id: randomToken(16), kind: limit.kind }));
  await db.batch(rows.map((row) => db.prepare("INSERT INTO auth_attempts (id, kind, created_at) VALUES (?, ?, ?)").bind(row.id, row.kind, now)));
  const counts = await Promise.all(limits.map(async (limit) => (await db.prepare("SELECT count(*) AS value FROM auth_attempts WHERE kind = ? AND created_at > ?")
    .bind(limit.kind, now - limit.windowMs).first<{ value: number }>())?.value ?? 0));
  const ids = rows.map((row) => row.id);
  if (counts.every((value, index) => value <= limits[index].max)) return ids;
  await forgetAttempts({ db, ids });
  return null;
}

/** Remove attempts that must not count, such as a correct setup code. */
export async function forgetAttempts({ db, ids }: { db: D1Database; ids: string[] }): Promise<void> {
  if (ids.length === 0) return;
  await db.prepare(`DELETE FROM auth_attempts WHERE id IN (${ids.map(() => "?").join(", ")})`).bind(...ids).run();
}

/** Remove expired sessions and challenges, and attempts that no rate limit counts any more. */
export async function deleteExpiredAuthRows({ db, now = Date.now() }: { db: D1Database; now?: number }): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").bind(now),
    db.prepare("DELETE FROM auth_challenges WHERE expires_at <= ?").bind(now),
    db.prepare("DELETE FROM auth_attempts WHERE created_at < ?").bind(now - DAY_MS),
  ]);
}
