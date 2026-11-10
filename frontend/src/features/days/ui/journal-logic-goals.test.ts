import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import { JournalLogic } from "./journal-logic.js";
import { seedCatalog, todayOf } from "./journal-test-helpers.js";

function setupTest(params: LogicTestParams = {}) {
  return setupLogicTest(params, async (app) => {
    await seedCatalog(app);
    return new JournalLogic(app.frontend);
  });
}

describe("JournalLogic tapping the switch of a goal", () => {
  it("should complete the goal, select its activity, and keep both on the server", async () => {
    const app = await setupTest();
    const { backend, logic, transport } = app;
    const today = todayOf(app);
    const held = transport.holdNextRequest();

    const tapP = logic.toggleGoal({ goalId: "goal-read" });
    expect(logic.plugins.selection.state.pending).toEqual({
      kind: "goal",
      id: "goal-read",
    });
    expect(logic.state.draft).toMatchObject({
      activityIds: ["activity-reading"],
      completedGoalIds: ["goal-read"],
    });
    await held.reached;
    expect(
      await backend.db.selectFrom("goalCompletions").selectAll().execute(),
    ).toEqual([]);
    held.release();
    await tapP;

    expect(logic.plugins.selection.state.selectionState).toEqual("success");
    expect(logic.plugins.selection.state.pending).toEqual(null);
    expect(logic.state).toMatchObject({ connection: "online", notice: null });
    expect(logic.state.draft).toMatchObject({
      activityIds: ["activity-reading"],
      completedGoalIds: ["goal-read"],
    });
    expect(
      await backend.db
        .selectFrom("goalCompletions")
        .select(["id", "goalId", "logicalDate", "entryId"])
        .execute(),
    ).toEqual([
      {
        id: `completion-goal-read-${today}`,
        goalId: "goal-read",
        logicalDate: today,
        entryId: null,
      },
    ]);
    expect(
      await backend.db
        .selectFrom("dayActivitySelections")
        .select(["logicalDate", "activityId", "selected"])
        .execute(),
    ).toEqual([
      { logicalDate: today, activityId: "activity-reading", selected: 1 },
    ]);
  });

  it("should take back the goal and its activity with the next tap", async () => {
    const app = await setupTest();
    const { backend, logic } = app;
    await logic.toggleGoal({ goalId: "goal-read" });

    await logic.toggleGoal({ goalId: "goal-read" });

    expect(logic.state.draft).toMatchObject({
      activityIds: [],
      completedGoalIds: [],
    });
    expect(
      await backend.db.selectFrom("goalCompletions").selectAll().execute(),
    ).toEqual([]);
    expect(
      await backend.db
        .selectFrom("dayActivitySelections")
        .select("selected")
        .execute(),
    ).toEqual([{ selected: 0 }]);
  });

  it("should change a goal with no activity alone", async () => {
    const app = await setupTest({ skipInitialization: true });
    const { backend, logic } = app;
    await backend.db
      .updateTable("goals")
      .set({ activityId: null })
      .where("id", "=", "goal-read")
      .execute();
    await logic.initialize();

    await logic.toggleGoal({ goalId: "goal-read" });

    expect(logic.state.draft).toMatchObject({
      activityIds: [],
      completedGoalIds: ["goal-read"],
    });
    expect(
      await backend.db.selectFrom("goalCompletions").select("goalId").execute(),
    ).toEqual([{ goalId: "goal-read" }]);
    expect(
      await backend.db
        .selectFrom("dayActivitySelections")
        .selectAll()
        .execute(),
    ).toEqual([]);
  });

  it("should complete every goal of the activity, and skip an archived goal", async () => {
    const app = await setupTest({ skipInitialization: true });
    const { backend, logic } = app;
    const base = {
      activityId: "activity-reading",
      scheduleType: "daily",
      sortOrder: 5,
    };
    await backend.db
      .insertInto("goals")
      .values([
        { ...base, id: "goal-twin", name: "Read more" },
        {
          ...base,
          id: "goal-old",
          name: "Read old",
          archivedAt: "2026-01-01T00:00:00.000Z",
        },
      ])
      .execute();
    await logic.initialize();

    await logic.toggleGoal({ goalId: "goal-read" });

    expect(logic.state.draft.completedGoalIds.toSorted()).toEqual([
      "goal-read",
      "goal-twin",
    ]);
    expect(
      await backend.db
        .selectFrom("goalCompletions")
        .select("goalId")
        .orderBy("goalId")
        .execute(),
    ).toEqual([{ goalId: "goal-read" }, { goalId: "goal-twin" }]);
  });

  it("should complete the goal of the day that is open, and link it to a saved entry", async () => {
    const app = await setupTest();
    const { backend, logic } = app;
    await logic.toggleMood({ moodId: "mood-good" });
    await logic.saveEntry();

    await logic.toggleGoal({ goalId: "goal-move" });

    expect(logic.state.entry?.completedGoalIds).toEqual(["goal-move"]);
    expect(logic.state.entry?.activityIds).toEqual(["activity-gym"]);
    const entry = await backend.db
      .selectFrom("entries")
      .select("id")
      .executeTakeFirstOrThrow();
    expect(
      await backend.db
        .selectFrom("goalCompletions")
        .select("entryId")
        .execute(),
    ).toEqual([{ entryId: entry.id }]);
  });

  it("should say so, and change nothing, while the device is offline", async () => {
    const app = await setupTest();
    const { frontend, logic, transport } = app;
    frontend.services.device.setOnline(false);
    transport.goOffline();

    await logic.toggleGoal({ goalId: "goal-read" });

    expect(logic.plugins.selection.state.selectionState).toEqual("pristine");
    expect(logic.state.connection).toEqual("offline");
    expect(logic.state.notice).toEqual({
      kind: "error",
      text: "You’re offline. Reconnect before updating a goal.",
    });
    expect(logic.state.draft.completedGoalIds).toEqual([]);
  });

  it("should put the goal and its activity back when the server cannot keep them", async () => {
    const app = await setupTest();
    const { logic, transport } = app;
    transport.goOffline();

    await logic.toggleGoal({ goalId: "goal-read" });

    expect(logic.plugins.selection.state.selectionState).toEqual("error");
    expect(logic.state.draft).toMatchObject({
      activityIds: [],
      completedGoalIds: [],
    });
    expect(logic.state.notice?.text).toEqual(
      "No connection. Check your internet connection and try again. The goal was restored.",
    );
    transport.goOnline();
    await logic.toggleGoal({ goalId: "goal-read" });
    expect(logic.state.draft.completedGoalIds).toEqual(["goal-read"]);
  });

  it("should put the goal back when the goal is gone from the server", async () => {
    const app = await setupTest({ skipInitialization: true });
    const { backend, logic } = app;
    await logic.initialize();
    await backend.db
      .deleteFrom("goals")
      .where("id", "=", "goal-read")
      .execute();

    await logic.toggleGoal({ goalId: "goal-read" });

    expect(logic.state.draft.completedGoalIds).toEqual([]);
    expect(logic.state.notice?.text).toEqual(
      "One goal is no longer available. The goal was restored.",
    );
  });

  it("should refuse a second tap while one waits, and a goal that the catalog lacks", async () => {
    const app = await setupTest();
    const { logic, transport } = app;
    const held = transport.holdNextRequest();

    const tapP = logic.toggleGoal({ goalId: "goal-read" });
    await logic.toggleGoal({ goalId: "goal-move" });
    await held.reached;
    held.release();
    await tapP;
    await logic.toggleGoal({ goalId: "goal-unknown" });

    expect(logic.state.draft.completedGoalIds).toEqual(["goal-read"]);
  });
});
