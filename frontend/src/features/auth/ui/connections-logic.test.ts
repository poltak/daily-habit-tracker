import { describe, expect, it } from "vitest";
import { ConnectionsLogic } from "./connections-logic.js";
import {
  setupLogicTest,
  type LogicTestParams,
  type TestDatabase,
} from "../../core/tests/full-application.js";

function setupTest(params: LogicTestParams = {}) {
  return setupLogicTest(params, (app) => new ConnectionsLogic(app.frontend));
}

/** An app that the owner connected, as the consent page and the token endpoint leave it. */
async function connectApp({
  db,
  name,
  createdAt,
}: {
  db: TestDatabase;
  name: string;
  createdAt: number;
}) {
  await db
    .insertInto("oauthClients")
    .values({
      id: `client-${name}`,
      secretHash: null,
      name,
      redirectUrisJson: "[]",
      tokenEndpointAuthMethod: "none",
      createdAt,
      approvedAt: createdAt,
    })
    .execute();
  await db
    .insertInto("oauthGrants")
    .values({
      id: `grant-${name}`,
      clientId: `client-${name}`,
      scope: "",
      resource: "https://daymark.test/api/mcp",
      createdAt,
      lastUsedAt: null,
    })
    .execute();
  await db
    .insertInto("oauthTokens")
    .values({
      id: `token-${name}`,
      kind: "refresh",
      grantId: `grant-${name}`,
      clientId: `client-${name}`,
      createdAt,
      expiresAt: createdAt + 1_000_000,
    })
    .execute();
}

describe("ConnectionsLogic tests", () => {
  it("should list the connected apps of the owner, newest first", async () => {
    const { backend, logic } = await setupTest({ skipInitialization: true });
    await connectApp({ db: backend.db, name: "Older app", createdAt: 1_000 });
    await connectApp({ db: backend.db, name: "Newer app", createdAt: 2_000 });

    await logic.initialize();

    expect(logic.state.loadConnectionsState).toEqual("success");
    expect(logic.state.connections).toMatchObject([
      { name: "Newer app", createdAt: 2_000, lastUsedAt: null },
      { name: "Older app", createdAt: 1_000, lastUsedAt: null },
    ]);
  });

  it("should show the error when the connections cannot be read without a session", async () => {
    const { logic } = await setupTest({ authenticated: false });

    expect(logic.state.loadConnectionsState).toEqual("error");
    expect(logic.state.loadConnectionsError).toEqual("Sign in to continue.");
    expect(logic.state.connections).toEqual([]);
  });

  it("should disconnect an app, and stop its tokens", async () => {
    const { backend, frontend, logic } = await setupTest({
      skipInitialization: true,
    });
    await connectApp({ db: backend.db, name: "ChatGPT", createdAt: 1_000 });
    await logic.initialize();

    const removeP = logic.removeConnection({ id: "grant-ChatGPT" });
    expect(logic.state.removeConnectionState).toEqual("running");
    await removeP;

    expect(frontend.services.dialogs.questions).toEqual([
      "Disconnect ChatGPT? It stops working until you connect it again.",
    ]);
    expect(logic.state.removeConnectionState).toEqual("success");
    expect(logic.state.notice).toEqual({
      kind: "success",
      text: "ChatGPT disconnected.",
    });
    expect(logic.state.connections).toEqual([]);
    expect(
      await backend.db.selectFrom("oauthGrants").selectAll().execute(),
    ).toEqual([]);
    expect(
      await backend.db.selectFrom("oauthTokens").selectAll().execute(),
    ).toEqual([]);
    // The app stays registered, so that it can connect again with its client ID.
    expect(
      await backend.db.selectFrom("oauthClients").select("id").execute(),
    ).toEqual([{ id: "client-ChatGPT" }]);
  });

  it("should keep the app connected when the owner says no", async () => {
    const { backend, frontend, logic } = await setupTest({
      skipInitialization: true,
    });
    await connectApp({ db: backend.db, name: "ChatGPT", createdAt: 1_000 });
    await logic.initialize();
    frontend.services.dialogs.answerWith(false);

    await logic.removeConnection({ id: "grant-ChatGPT" });

    expect(logic.state.removeConnectionState).toEqual("pristine");
    expect(logic.state.connections).toHaveLength(1);
    expect(
      await backend.db.selectFrom("oauthGrants").selectAll().execute(),
    ).toHaveLength(1);
  });

  it("should report a connection that does not exist", async () => {
    const { backend, logic } = await setupTest({ skipInitialization: true });
    await connectApp({ db: backend.db, name: "ChatGPT", createdAt: 1_000 });
    await logic.initialize();

    await logic.removeConnection({ id: "no-such-connection" });

    expect(logic.state.removeConnectionState).toEqual("error");
    expect(logic.state.removeConnectionError).toEqual("Connection not found.");
    expect(logic.state.notice).toEqual({
      kind: "error",
      text: "Connection not found.",
    });
    expect(logic.state.connections).toHaveLength(1);
    expect(
      await backend.db.selectFrom("oauthGrants").selectAll().execute(),
    ).toHaveLength(1);
  });
});
