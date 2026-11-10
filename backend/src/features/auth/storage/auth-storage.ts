import {
  planQuery,
  planRaw,
  planWrite,
  type PlannedStatement,
} from "../../core/database/planned-statement.js";
import type { BackendStorageProps } from "../../core/storage/types.js";
import type {
  AuthSessionRow,
  ChallengePurpose,
  NewOauthClient,
  NewOauthCode,
  NewOauthGrant,
  NewOauthToken,
  OauthClient,
  OauthGrant,
  OauthToken,
  Passkey,
} from "./types.js";

/** The passkeys, the WebAuthn challenges, the sessions, the setup code attempts, and the apps that the owner connected. */
export class AuthStorage {
  constructor(private readonly deps: BackendStorageProps) {}

  // ---------- Passkeys ----------

  listPasskeys(): Promise<Passkey[]> {
    return this.deps.db
      .selectFrom("passkeys")
      .selectAll()
      .orderBy("createdAt")
      .orderBy("id")
      .execute();
  }

  async countPasskeys(): Promise<number> {
    const row = await this.deps.db
      .selectFrom("passkeys")
      .select((expression) => expression.fn.countAll<number>().as("total"))
      .executeTakeFirstOrThrow();
    return Number(row.total);
  }

  findPasskey({ id }: { id: string }): Promise<Passkey | undefined> {
    return this.deps.db
      .selectFrom("passkeys")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
  }

  planInsertPasskey(
    passkey: Omit<Passkey, "lastUsedAt">,
  ): PlannedStatement<never> {
    return planQuery(this.deps.db.insertInto("passkeys").values(passkey));
  }

  planPasskeyUsed({
    id,
    counter,
    backedUp,
    now,
  }: {
    id: string;
    counter: number;
    backedUp: number;
    now: number;
  }): PlannedStatement<never> {
    return planWrite(
      this.deps.db
        .updateTable("passkeys")
        .set({ counter, backedUp, lastUsedAt: now })
        .where("id", "=", id),
    );
  }

  /**
   * The guard stays in the statement, because two removals at the same time
   * must not remove the last two passkeys and lock the owner out.
   */
  planDeletePasskeyIfNotLast({ id }: { id: string }): PlannedStatement<never> {
    return planRaw({
      sql: `DELETE FROM passkeys
            WHERE id = ?1 AND (SELECT COUNT(*) FROM passkeys) > 1`,
      parameters: [id],
    });
  }

  planPasskeyExists({
    id,
  }: {
    id: string;
  }): PlannedStatement<{ found: number }> {
    return planRaw({
      sql: `SELECT EXISTS (SELECT 1 FROM passkeys WHERE id = ?1) AS found`,
      parameters: [id],
    });
  }

  // ---------- WebAuthn challenges ----------

  async insertChallenge(challenge: {
    id: string;
    purpose: ChallengePurpose;
    challenge: string;
    createdAt: number;
    expiresAt: number;
  }): Promise<void> {
    await this.deps.db.insertInto("authChallenges").values(challenge).execute();
  }

  /** Delete the row and return it, so that a replay finds nothing. */
  takeChallenge({
    id,
    purpose,
  }: {
    id: string;
    purpose: ChallengePurpose;
  }): Promise<{ challenge: string; expiresAt: number } | undefined> {
    return this.deps.db
      .deleteFrom("authChallenges")
      .where("id", "=", id)
      .where("purpose", "=", purpose)
      .returning(["challenge", "expiresAt"])
      .executeTakeFirst();
  }

  // ---------- Sessions ----------

  findSession({
    id,
    now,
  }: {
    id: string;
    now: number;
  }): Promise<AuthSessionRow | undefined> {
    return this.deps.db
      .selectFrom("authSessions")
      .selectAll()
      .where("id", "=", id)
      .where("expiresAt", ">", now)
      .executeTakeFirst();
  }

  async renewSession({
    id,
    now,
    expiresAt,
  }: {
    id: string;
    now: number;
    expiresAt: number;
  }): Promise<void> {
    await this.deps.db
      .updateTable("authSessions")
      .set({ lastSeenAt: now, expiresAt })
      .where("id", "=", id)
      .execute();
  }

  planInsertSession(session: {
    id: string;
    passkeyId: string | null;
    createdAt: number;
    lastSeenAt: number;
    expiresAt: number;
  }): PlannedStatement<never> {
    return planQuery(this.deps.db.insertInto("authSessions").values(session));
  }

  async deleteSession({ id }: { id: string }): Promise<void> {
    await this.deps.db
      .deleteFrom("authSessions")
      .where("id", "=", id)
      .execute();
  }

  /** Run after `planDeletePasskeyIfNotLast`: only a removed passkey ends its sessions. */
  planDeleteSessionsOfRemovedPasskey({
    passkeyId,
  }: {
    passkeyId: string;
  }): PlannedStatement<never> {
    return planRaw({
      sql: `DELETE FROM auth_sessions
            WHERE passkey_id = ?1
              AND NOT EXISTS (SELECT 1 FROM passkeys WHERE id = ?1)`,
      parameters: [passkeyId],
    });
  }

  /** Sessions that nobody used for 180 days. */
  planDeleteExpiredSessions({ now }: { now: number }): PlannedStatement<never> {
    return planRaw({
      sql: `DELETE FROM auth_sessions WHERE expires_at <= ?1`,
      parameters: [now],
    });
  }

  planDeleteExpiredChallenges({
    now,
  }: {
    now: number;
  }): PlannedStatement<never> {
    return planRaw({
      sql: `DELETE FROM auth_challenges WHERE expires_at <= ?1`,
      parameters: [now],
    });
  }

  /** Attempts that no rate limit counts any more. */
  planDeleteOldAttempts({
    before,
  }: {
    before: number;
  }): PlannedStatement<never> {
    return planRaw({
      sql: `DELETE FROM auth_attempts WHERE created_at < ?1`,
      parameters: [before],
    });
  }

  // ---------- Connected apps (OAuth) ----------

  async insertClient(client: NewOauthClient): Promise<void> {
    await this.deps.db.insertInto("oauthClients").values(client).execute();
  }

  findClient({ id }: { id: string }): Promise<OauthClient | undefined> {
    return this.deps.db
      .selectFrom("oauthClients")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
  }

  findGrant({ id }: { id: string }): Promise<OauthGrant | undefined> {
    return this.deps.db
      .selectFrom("oauthGrants")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
  }

  async listGrantIdsOfClient({
    clientId,
  }: {
    clientId: string;
  }): Promise<string[]> {
    const rows = await this.deps.db
      .selectFrom("oauthGrants")
      .select("id")
      .where("clientId", "=", clientId)
      .execute();
    return rows.map(({ id }) => id);
  }

  /** The apps of the owner, newest first. */
  listConnections(): Promise<
    {
      id: string;
      name: string;
      createdAt: number;
      lastUsedAt: number | null;
    }[]
  > {
    return this.deps.db
      .selectFrom("oauthGrants")
      .innerJoin("oauthClients", "oauthClients.id", "oauthGrants.clientId")
      .select([
        "oauthGrants.id",
        "oauthClients.name",
        "oauthGrants.createdAt",
        "oauthGrants.lastUsedAt",
      ])
      .orderBy("oauthGrants.createdAt", "desc")
      .orderBy("oauthGrants.id")
      .execute();
  }

  planInsertGrant(grant: NewOauthGrant): PlannedStatement<never> {
    return planQuery(this.deps.db.insertInto("oauthGrants").values(grant));
  }

  planInsertCode(code: NewOauthCode): PlannedStatement<never> {
    return planQuery(this.deps.db.insertInto("oauthCodes").values(code));
  }

  planMarkClientApproved({
    id,
    now,
  }: {
    id: string;
    now: number;
  }): PlannedStatement<never> {
    return planWrite(
      this.deps.db
        .updateTable("oauthClients")
        .set({ approvedAt: now })
        .where("id", "=", id),
    );
  }

  /** The statements that remove one connection with its codes and tokens. */
  planDeleteGrant({ id }: { id: string }): PlannedStatement<never>[] {
    const { db } = this.deps;
    return [
      planWrite(db.deleteFrom("oauthTokens").where("grantId", "=", id)),
      planWrite(db.deleteFrom("oauthCodes").where("grantId", "=", id)),
      planWrite(db.deleteFrom("oauthGrants").where("id", "=", id)),
    ];
  }

  /** Delete the code and return it, so that it works once, also when the rest of the request fails. */
  takeCode({ id }: { id: string }): Promise<NewOauthCode | undefined> {
    return this.deps.db
      .deleteFrom("oauthCodes")
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst();
  }

  planInsertToken(token: NewOauthToken): PlannedStatement<never> {
    return planQuery(this.deps.db.insertInto("oauthTokens").values(token));
  }

  planSetTokenExpiry({
    id,
    expiresAt,
  }: {
    id: string;
    expiresAt: number;
  }): PlannedStatement<never> {
    return planWrite(
      this.deps.db
        .updateTable("oauthTokens")
        .set({ expiresAt })
        .where("id", "=", id),
    );
  }

  findLiveRefreshToken({
    id,
    now,
  }: {
    id: string;
    now: number;
  }): Promise<OauthToken | undefined> {
    return this.deps.db
      .selectFrom("oauthTokens")
      .selectAll()
      .where("id", "=", id)
      .where("kind", "=", "refresh")
      .where("expiresAt", ">", now)
      .executeTakeFirst();
  }

  async setTokenExpiry({
    id,
    expiresAt,
  }: {
    id: string;
    expiresAt: number;
  }): Promise<void> {
    await this.deps.db
      .updateTable("oauthTokens")
      .set({ expiresAt })
      .where("id", "=", id)
      .execute();
  }

  /** The connection of a live access token. */
  findAccessTokenGrant({ id, now }: { id: string; now: number }): Promise<
    | {
        grantId: string;
        resource: string;
        lastUsedAt: number | null;
      }
    | undefined
  > {
    return this.deps.db
      .selectFrom("oauthTokens")
      .innerJoin("oauthGrants", "oauthGrants.id", "oauthTokens.grantId")
      .select([
        "oauthGrants.id as grantId",
        "oauthGrants.resource",
        "oauthGrants.lastUsedAt",
      ])
      .where("oauthTokens.id", "=", id)
      .where("oauthTokens.kind", "=", "access")
      .where("oauthTokens.expiresAt", ">", now)
      .executeTakeFirst();
  }

  async markGrantUsed({ id, now }: { id: string; now: number }): Promise<void> {
    await this.deps.db
      .updateTable("oauthGrants")
      .set({ lastUsedAt: now })
      .where("id", "=", id)
      .execute();
  }

  // ---------- Clean-up of the OAuth rows ----------

  /**
   * Expired codes and tokens, grants with no refresh token after a day, and
   * clients that nobody approved after a day. A client that the owner allowed
   * once stays, because some clients use their client ID again after a
   * disconnect.
   */
  planDeleteExpiredOAuthRows({
    now,
    dayAgo,
  }: {
    now: number;
    dayAgo: number;
  }): PlannedStatement<never>[] {
    return [
      planRaw({
        sql: `DELETE FROM oauth_codes WHERE expires_at <= ?1`,
        parameters: [now],
      }),
      planRaw({
        sql: `DELETE FROM oauth_tokens WHERE expires_at <= ?1`,
        parameters: [now],
      }),
      planRaw({
        sql: `DELETE FROM oauth_grants WHERE created_at < ?1 AND NOT EXISTS (
                SELECT 1 FROM oauth_tokens
                WHERE oauth_tokens.grant_id = oauth_grants.id AND oauth_tokens.kind = 'refresh')`,
        parameters: [dayAgo],
      }),
      planRaw({
        sql: `DELETE FROM oauth_clients WHERE approved_at IS NULL AND created_at < ?1`,
        parameters: [dayAgo],
      }),
    ];
  }

  // ---------- Setup code attempts ----------

  planInsertAttempts(
    attempts: { id: string; kind: string; createdAt: number }[],
  ): PlannedStatement<never> {
    return planQuery(this.deps.db.insertInto("authAttempts").values(attempts));
  }

  planCountAttempts({
    kind,
    since,
  }: {
    kind: string;
    since: number;
  }): PlannedStatement<{ total: number }> {
    return planRaw({
      sql: `SELECT COUNT(*) AS total FROM auth_attempts WHERE kind = ?1 AND created_at > ?2`,
      parameters: [kind, since],
    });
  }

  planDeleteAttempts({ ids }: { ids: string[] }): PlannedStatement<never> {
    return planWrite(
      this.deps.db.deleteFrom("authAttempts").where("id", "in", ids),
    );
  }
}
