import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import type { CatalogEvent } from "../../catalog/types.js";
import { CatalogReadPlugin } from "./catalog-read-plugin.js";
import { seedCatalog } from "./journal-test-helpers.js";

function setupTest(params: LogicTestParams = {}) {
  return setupLogicTest(params, async (app) => {
    await seedCatalog(app);
    return new CatalogReadPlugin(app.frontend);
  });
}

describe("CatalogReadPlugin tests", () => {
  it("should tell the other pages the catalog that it read", async () => {
    const { frontend, logic } = await setupTest({ skipInitialization: true });
    const events: CatalogEvent[] = [];
    frontend.catalogEvents.listen((event) => {
      events.push(event);
    });

    await logic.load();

    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event?.type).toEqual("catalogRead");
    if (event?.type === "catalogRead") {
      expect(event.catalog.groups.map(({ id }) => id)).toEqual(
        logic.state.groups.map(({ id }) => id),
      );
      expect(event.catalog.activities).toHaveLength(
        logic.state.activities.length,
      );
      expect(event.catalog.goals).toHaveLength(logic.state.goals.length);
    }
  });

  it("should read the moods, groups, activities and goals", async () => {
    const { logic, transport } = await setupTest({ skipInitialization: true });
    expect(logic.state.loadCatalogState).toEqual("pristine");
    expect(logic.state.moods).toEqual([]);
    const held = transport.holdNextRequest();

    const loadP = logic.load();
    expect(logic.state.loadCatalogState).toEqual("running");
    await held.reached;
    held.release();
    const loaded = await loadP;

    expect(loaded).toEqual(true);
    expect(logic.state.loadCatalogState).toEqual("success");
    expect(logic.state.moods).toMatchObject([
      { id: "mood-rad", name: "Rad", score: 5, color: "#ee8f6d" },
      { id: "mood-good" },
      { id: "mood-meh" },
      { id: "mood-bad" },
      { id: "mood-awful", score: 1 },
    ]);
    expect(logic.state.groups.map(({ id }) => id)).toEqual([
      "group-health",
      "group-work",
      "group-home",
      "group-people",
      "group-leisure",
    ]);
    expect(logic.state.activities[0]).toMatchObject({
      id: "activity-gym",
      groupId: "group-health",
      name: "Gym",
      icon: "fitness_center",
      archived: false,
    });
    expect(logic.state.goals).toMatchObject([
      {
        id: "goal-move",
        activityId: "activity-gym",
        repeatType: "weekly",
        scheduleType: "times_per_week",
        targetPerWeek: 3,
      },
      { id: "goal-read", repeatType: "daily", scheduleType: "daily" },
    ]);
    expect(logic.knownActivityIds().has("activity-gym")).toEqual(true);
    expect(logic.knownGoalIds().has("goal-read")).toEqual(true);
    expect(logic.knownGoalIds().has("goal-none")).toEqual(false);
  });

  it("should mark the catalog loaded only after the first read", async () => {
    const { logic, transport } = await setupTest({ skipInitialization: true });
    expect(logic.state.catalogLoaded).toEqual(false);
    const held = transport.holdNextRequest();

    const loadP = logic.load();
    await held.reached;
    expect(logic.state.catalogLoaded).toEqual(false);
    held.release();
    await loadP;

    expect(logic.state.catalogLoaded).toEqual(true);
  });

  it("should show an archived activity as archived, and the icon of an old placeholder", async () => {
    const { backend, logic } = await setupTest({ skipInitialization: true });
    await backend.db
      .updateTable("activities")
      .set({ archivedAt: "2026-01-01T00:00:00.000Z", materialIcon: "✨" })
      .where("id", "=", "activity-cook")
      .execute();

    await logic.load();

    expect(
      logic.state.activities.find(({ id }) => id === "activity-cook"),
    ).toMatchObject({ archived: true, icon: "restaurant" });
  });

  it("should report the failure, and keep the catalog it has", async () => {
    const { logic, transport } = await setupTest();
    await logic.load();
    transport.goOffline();

    const loaded = await logic.load();

    expect(loaded).toEqual(false);
    expect(logic.state.loadCatalogState).toEqual("error");
    expect(logic.state.loadCatalogError).toEqual(
      "No connection. Check your internet connection and try again.",
    );
    expect(logic.state.moods).toHaveLength(5);
    expect(logic.state.catalogLoaded).toEqual(true);
  });

  it("should not mark the catalog loaded when the first read fails", async () => {
    const { logic, transport } = await setupTest({ skipInitialization: true });
    transport.goOffline();

    await logic.load();

    expect(logic.state.loadCatalogState).toEqual("error");
    expect(logic.state.catalogLoaded).toEqual(false);
  });
});
