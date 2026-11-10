import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import type { CatalogEvent } from "../types.js";
import { CatalogSetupLogic } from "./catalog-setup-logic.js";

function setupTest(params: LogicTestParams = {}) {
  return setupLogicTest(params, async (app) => {
    await app.backend.logic.catalog.read();
    return new CatalogSetupLogic(app.frontend);
  });
}

function recordEvents(app: Awaited<ReturnType<typeof setupTest>>) {
  const events: CatalogEvent[] = [];
  app.frontend.catalogEvents.listen((event) => {
    events.push(event);
  });
  return events;
}

describe("CatalogSetupLogic loading", () => {
  it("should read the catalog", async () => {
    const { logic } = await setupTest();

    expect(await logic.load()).toEqual(true);

    expect(logic.state.groups).toHaveLength(5);
    expect(logic.state.activities).toHaveLength(12);
    expect(logic.state.goals).toHaveLength(2);
    expect(logic.state.loadCatalogState).toEqual("success");
  });

  it("should say so when the catalog cannot be read", async () => {
    const { logic, transport } = await setupTest();
    transport.goOffline();

    expect(await logic.load()).toEqual(false);

    expect(logic.state.loadCatalogError).toEqual(
      "No connection. Check your internet connection and try again.",
    );
    expect(logic.state.groups).toEqual([]);
  });

  it("should show the notice that another page leaves for the Setup page", async () => {
    const { frontend, logic } = await setupTest();

    frontend.catalogEvents.emitDetached({
      type: "catalogChanged",
      notice: { target: "settings", text: "Activity added." },
    });
    await Promise.resolve();
    expect(logic.state.notice).toEqual({
      kind: "success",
      text: "Activity added.",
    });
    logic.clearNotice();
    frontend.catalogEvents.emitDetached({
      type: "catalogChanged",
      notice: { target: "log", text: "Activity added." },
    });
    await Promise.resolve();

    expect(logic.state.notice).toEqual(null);
  });
});

describe("CatalogSetupLogic filter and open groups", () => {
  it("should keep the filter, and close each group when the filter ends", async () => {
    const { logic } = await setupTest();
    logic.setGroupOpen({ groupId: "group-work", open: true });
    logic.setGroupOpen({ groupId: "group-home", open: true });
    logic.setGroupOpen({ groupId: "group-work", open: false });
    expect(logic.state.openGroupIds).toEqual(["group-home"]);

    logic.setActivityQuery({ query: "walk" });
    expect(logic.state.openGroupIds).toEqual(["group-home"]);
    logic.setActivityQuery({ query: " " });

    expect(logic.state.openGroupIds).toEqual([]);
    expect(logic.state.activityQuery).toEqual(" ");
  });
});

describe("CatalogSetupLogic visits", () => {
  it("should start a visit with the groups closed and no filter", async () => {
    const { logic } = await setupTest();
    logic.setGroupOpen({ groupId: "group-work", open: true });
    logic.setActivityQuery({ query: "walk" });

    logic.startVisit();

    expect(logic.state.openGroupIds).toEqual([]);
    expect(logic.state.activityQuery).toEqual("");
  });
});

describe("CatalogSetupLogic adding a group", () => {
  it("should add a group, empty the field, and tell the other pages", async () => {
    const app = await setupTest();
    const { backend, logic } = app;
    const events = recordEvents(app);
    await logic.load();
    logic.setNewGroupName({ name: "Travel" });

    await logic.createGroup();

    expect(logic.state.notice).toEqual({
      kind: "success",
      text: "Setup updated.",
    });
    expect(logic.state.newGroupName).toEqual("");
    expect(logic.state.groups.map((group) => group.name)).toContain("Travel");
    expect(logic.state.pendingKeys).toEqual([]);
    expect(events).toEqual([{ type: "catalogChanged" }]);
    expect(
      (
        await backend.db
          .selectFrom("activityGroups")
          .select("name")
          .where("name", "=", "Travel")
          .execute()
      ).length,
    ).toEqual(1);
  });

  it("should refuse a group with no name, and keep the field", async () => {
    const app = await setupTest();
    const { logic } = app;
    const events = recordEvents(app);
    logic.setNewGroupName({ name: "  " });

    await logic.createGroup();

    expect(logic.state.notice).toEqual({
      kind: "error",
      text: "Group name is required.",
    });
    expect(logic.state.newGroupName).toEqual("  ");
    expect(events).toEqual([]);
  });

  it("should wait for a second add of a group while the first runs", async () => {
    const { logic, transport, backend } = await setupTest();
    await logic.load();
    logic.setNewGroupName({ name: "Travel" });
    const held = transport.holdNextRequest();

    const first = logic.createGroup();
    await held.reached;
    expect(logic.isPending("create:group")).toEqual(true);
    await logic.createGroup();
    held.release();
    await first;

    expect(
      await backend.db.selectFrom("activityGroups").select("id").execute(),
    ).toHaveLength(6);
  });

  it("should say that the refresh failed when the group was added", async () => {
    const { logic, transport } = await setupTest();
    logic.setNewGroupName({ name: "Travel" });
    const held = transport.holdNextResponse();

    const added = logic.createGroup();
    await held.reached;
    transport.goOffline();
    held.release();
    await added;

    expect(logic.state.notice?.kind).toEqual("error");
    expect(logic.state.notice?.text).toContain(
      "Created, but refresh failed; refresh the page before retrying.",
    );
    expect(logic.state.newGroupName).toEqual("");
  });
});

describe("CatalogSetupLogic adding a goal", () => {
  it("should add a goal that starts today, with the name given", async () => {
    const { logic, backend } = await setupTest();
    await logic.load();
    logic.setNewGoalName({ name: "Meditate" });

    await logic.createGoal();

    expect(logic.state.goals.map((goal) => goal.name)).toContain("Meditate");
    expect(logic.state.newGoalName).toEqual("");
    const row = await backend.db
      .selectFrom("goals")
      .select(["name", "startDate", "activityId"])
      .where("name", "=", "Meditate")
      .executeTakeFirst();
    expect(row).toEqual({
      name: "Meditate",
      startDate: new Date().toISOString().slice(0, 10),
      activityId: null,
    });
  });

  it("should name a goal with no name Activity goal", async () => {
    const { logic } = await setupTest();
    await logic.load();

    await logic.createGoal();

    expect(logic.state.goals.map((goal) => goal.name)).toContain(
      "Activity goal",
    );
  });
});
