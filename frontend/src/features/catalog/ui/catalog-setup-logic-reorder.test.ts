import { describe, expect, it } from "vitest";
import { setupLogicTest } from "../../core/tests/full-application.js";
import { CatalogSetupLogic } from "./catalog-setup-logic.js";

function setupTest() {
  return setupLogicTest({}, async (app) => {
    await app.backend.logic.catalog.read();
    return new CatalogSetupLogic(app.frontend);
  });
}

const ids = (items: Array<{ id: string }>) => items.map((item) => item.id);

describe("CatalogSetupLogic moving an item", () => {
  it("should move a group down and up", async () => {
    const { logic } = await setupTest();
    await logic.load();

    await logic.move({
      kind: "group",
      itemId: "group-health",
      items: logic.state.groups,
      direction: 1,
    });

    expect(ids(logic.state.groups).slice(0, 2)).toEqual([
      "group-work",
      "group-health",
    ]);
    expect(logic.state.notice?.text).toEqual("Setup updated.");
    await logic.move({
      kind: "group",
      itemId: "group-health",
      items: logic.state.groups,
      direction: -1,
    });
    expect(ids(logic.state.groups).slice(0, 2)).toEqual([
      "group-health",
      "group-work",
    ]);
  });

  it("should move a goal and the last activity of a group", async () => {
    const { logic } = await setupTest();
    await logic.load();

    await logic.move({
      kind: "goal",
      itemId: "goal-move",
      items: logic.state.goals,
      direction: 1,
    });
    const leisure = logic.state.activities.filter(
      (a) => a.groupId === "group-leisure",
    );
    await logic.move({
      kind: "activity",
      itemId: "activity-music",
      items: leisure,
      direction: -1,
    });

    expect(ids(logic.state.goals)).toEqual(["goal-read", "goal-move"]);
    const music = logic.state.activities.find((a) => a.id === "activity-music");
    const gaming = logic.state.activities.find(
      (a) => a.id === "activity-gaming",
    );
    expect(music?.sortOrder).toBeLessThan(gaming?.sortOrder ?? 0);
  });

  it("should do nothing at the end of the list", async () => {
    const { logic, transport } = await setupTest();
    await logic.load();
    transport.failNextRequestAtGateway(503);

    await logic.move({
      kind: "group",
      itemId: "group-health",
      items: logic.state.groups,
      direction: -1,
    });

    expect(logic.state.notice).toEqual(null);
    expect(logic.state.pendingKeys).toEqual([]);
  });

  it("should number the items again when two have the same sort value", async () => {
    const { logic, backend } = await setupTest();
    await backend.db
      .updateTable("activityGroups")
      .set({ sortOrder: 0 })
      .execute();
    await logic.load();

    await logic.move({
      kind: "group",
      itemId: "group-work",
      items: logic.state.groups,
      direction: -1,
    });

    expect(
      (
        await backend.db
          .selectFrom("activityGroups")
          .select(["id", "sortOrder"])
          .orderBy("sortOrder")
          .execute()
      ).map((group) => group.id),
    ).toEqual([
      "group-work",
      "group-health",
      "group-home",
      "group-people",
      "group-leisure",
    ]);
  });

  it("should show the move at once, and put the order back when the server refuses", async () => {
    const { logic, transport, backend } = await setupTest();
    await logic.load();
    const held = transport.holdNextRequest();

    const moving = logic.move({
      kind: "group",
      itemId: "group-health",
      items: logic.state.groups,
      direction: 1,
    });
    await held.reached;
    expect(logic.isPending("reorder:group")).toEqual(true);
    expect(logic.state.overrides["group:group-health"]).toEqual({
      sortOrder: 1,
    });
    // A second move of the same kind waits.
    await logic.move({
      kind: "group",
      itemId: "group-work",
      items: logic.state.groups,
      direction: 1,
    });
    await backend.logic.catalogChange.reorder({
      kind: "group",
      updates: [{ id: "group-health", sortOrder: 7, expectedSortOrder: 0 }],
    });
    held.release();
    await moving;

    expect(logic.state.overrides).toEqual({});
    expect(logic.state.notice?.kind).toEqual("error");
  });

  it("should refuse a move from a stale list, and change nothing", async () => {
    const { logic, backend } = await setupTest();
    await logic.load();
    await backend.logic.catalogChange.reorder({
      kind: "group",
      updates: [{ id: "group-health", sortOrder: 7, expectedSortOrder: 0 }],
    });

    await logic.move({
      kind: "group",
      itemId: "group-health",
      items: logic.state.groups,
      direction: 1,
    });

    expect(logic.state.notice).toEqual({
      kind: "error",
      text: "Setup changed on another device. Refresh before reordering.",
    });
    expect(
      await backend.db
        .selectFrom("activityGroups")
        .select(["id", "sortOrder"])
        .where("id", "in", ["group-health", "group-work"])
        .orderBy("id")
        .execute(),
    ).toEqual([
      { id: "group-health", sortOrder: 7 },
      { id: "group-work", sortOrder: 1 },
    ]);
  });

  it("should say that the refresh failed when the move was stored", async () => {
    const { logic, transport } = await setupTest();
    await logic.load();
    const held = transport.holdNextResponse();

    const moving = logic.move({
      kind: "group",
      itemId: "group-health",
      items: logic.state.groups,
      direction: 1,
    });
    await held.reached;
    transport.goOffline();
    held.release();
    await moving;

    expect(logic.state.notice?.text).toContain(
      "Reorder saved, but setup refresh failed. The change is still shown; try refreshing again.",
    );
  });
});
