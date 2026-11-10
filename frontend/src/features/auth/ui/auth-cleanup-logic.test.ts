import { describe, expect, it } from "vitest";
import { AuthLogic } from "./auth-logic.js";
import { setupLogicTest } from "../../core/tests/full-application.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function setupTest() {
  return setupLogicTest({}, (app) => new AuthLogic(app.frontend));
}

describe("AuthLogic clean-up tests", () => {
  it("should remove expired sessions, challenges, attempts, codes and tokens, and keep the rest", async () => {
    const { backend } = await setupTest();
    const now = backend.services.clock.now();
    const expiredAt = now - 1;
    await backend.db
      .insertInto("authChallenges")
      .values([
        {
          id: "old-challenge",
          purpose: "registration",
          challenge: "a",
          createdAt: 1,
          expiresAt: expiredAt,
        },
        {
          id: "live-challenge",
          purpose: "registration",
          challenge: "b",
          createdAt: 1,
          expiresAt: now + DAY_MS,
        },
      ])
      .execute();
    await backend.db
      .insertInto("authAttempts")
      .values([
        { id: "old-attempt", kind: "setup_code", createdAt: now - 2 * DAY_MS },
        { id: "new-attempt", kind: "setup_code", createdAt: now },
      ])
      .execute();
    await backend.db
      .insertInto("authSessions")
      .values({
        id: "old-session",
        passkeyId: null,
        createdAt: 1,
        lastSeenAt: 1,
        expiresAt: expiredAt,
      })
      .execute();
    backend.services.clock.advance(1000);

    await backend.logic.authSession.deleteExpired();

    const ids = async (table: "authChallenges" | "authAttempts") =>
      (await backend.db.selectFrom(table).select("id").execute()).map(
        (row) => row.id,
      );
    expect(await ids("authChallenges")).toEqual(["live-challenge"]);
    expect(await ids("authAttempts")).toEqual(["new-attempt"]);
    const sessions = await backend.db
      .selectFrom("authSessions")
      .selectAll()
      .execute();
    expect(sessions.map((session) => session.id)).not.toContain("old-session");
    expect(sessions).toHaveLength(1);
  });
});
