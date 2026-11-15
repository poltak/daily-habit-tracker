import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import { JournalLogic } from "./journal-logic.js";
import { draftKey, seedCatalog, todayOf } from "./journal-test-helpers.js";

function setupTest(params: LogicTestParams = {}) {
  return setupLogicTest(params, async (app) => {
    await seedCatalog(app);
    return new JournalLogic(app.frontend);
  });
}

describe("JournalLogic taps that wait at the same time", () => {
  it("should run taps on different activities together, and keep the draft until the last one ends", async () => {
    const app = await setupTest();
    const { backend, frontend, logic, transport } = app;
    const today = todayOf(app);
    const first = transport.holdNextRequest();
    const second = transport.holdNextRequest();

    const walkP = logic.toggleActivity({ activityId: "activity-walk" });
    const musicP = logic.toggleActivity({ activityId: "activity-music" });
    await first.reached;
    await second.reached;

    expect(logic.plugins.selection.state.pendingKeys).toEqual([
      "activity:activity-walk",
      "activity:activity-music",
    ]);
    expect(logic.state.draft.activityIds).toEqual([
      "activity-walk",
      "activity-music",
    ]);
    expect(
      await backend.db
        .selectFrom("dayActivitySelections")
        .selectAll()
        .execute(),
    ).toEqual([]);

    first.release();
    await walkP;

    expect(logic.plugins.selection.state.pendingKeys).toEqual([
      "activity:activity-music",
    ]);
    expect(frontend.services.device.leaveWarning).toEqual(true);
    expect(frontend.browserStorage.getItem(draftKey(today))).not.toEqual(null);
    second.release();
    await musicP;

    expect(logic.plugins.selection.state.pendingKeys).toEqual([]);
    expect(frontend.services.device.leaveWarning).toEqual(false);
    expect(frontend.browserStorage.getItem(draftKey(today))).toEqual(null);
    expect(logic.state.draft.activityIds).toEqual([
      "activity-walk",
      "activity-music",
    ]);
    expect(
      await backend.db
        .selectFrom("dayActivitySelections")
        .select(["activityId", "selected"])
        .orderBy("activityId")
        .execute(),
    ).toEqual([
      { activityId: "activity-music", selected: 1 },
      { activityId: "activity-walk", selected: 1 },
    ]);
  });

  it("should keep a mood and an activity that wait at the same time", async () => {
    const app = await setupTest();
    const { backend, logic, transport } = app;
    const first = transport.holdNextRequest();
    const second = transport.holdNextRequest();

    const moodP = logic.toggleMood({ moodId: "mood-good" });
    const walkP = logic.toggleActivity({ activityId: "activity-walk" });
    await first.reached;
    await second.reached;
    first.release();
    second.release();
    await Promise.all([moodP, walkP]);

    expect(logic.state.draft).toMatchObject({
      moodId: "mood-good",
      activityIds: ["activity-walk"],
    });
    expect(
      await backend.db
        .selectFrom("dayMoodSelections")
        .select("moodId")
        .execute(),
    ).toEqual([{ moodId: "mood-good" }]);
    expect(
      await backend.db
        .selectFrom("dayActivitySelections")
        .select("activityId")
        .execute(),
    ).toEqual([{ activityId: "activity-walk" }]);
  });

  it("should refuse a tap on an activity while a goal of the activity waits", async () => {
    const app = await setupTest();
    const { backend, logic, transport } = app;
    const held = transport.holdNextRequest();

    const goalP = logic.toggleGoal({ goalId: "goal-move" });
    await held.reached;
    await logic.toggleActivity({ activityId: "activity-gym" });

    expect(logic.plugins.selection.state.pendingKeys).toEqual([
      "goal:goal-move",
      "activity:activity-gym",
    ]);
    expect(logic.state.draft).toMatchObject({
      activityIds: ["activity-gym"],
      completedGoalIds: ["goal-move"],
    });
    held.release();
    await goalP;

    expect(
      await backend.db
        .selectFrom("dayActivitySelections")
        .select(["activityId", "selected"])
        .execute(),
    ).toEqual([{ activityId: "activity-gym", selected: 1 }]);
  });

  it("should refuse a tap on a goal while its activity waits", async () => {
    const app = await setupTest();
    const { logic, transport } = app;
    const held = transport.holdNextRequest();

    const activityP = logic.toggleActivity({ activityId: "activity-gym" });
    await held.reached;
    await logic.toggleGoal({ goalId: "goal-move" });
    held.release();
    await activityP;

    expect(logic.state.draft).toMatchObject({
      activityIds: ["activity-gym"],
      completedGoalIds: ["goal-move"],
    });
  });

  it("should refuse a second tap on the same activity while it waits", async () => {
    const app = await setupTest();
    const { backend, logic, transport } = app;
    const held = transport.holdNextRequest();

    const walkP = logic.toggleActivity({ activityId: "activity-walk" });
    await held.reached;
    await logic.toggleActivity({ activityId: "activity-walk" });

    expect(logic.state.draft.activityIds).toEqual(["activity-walk"]);
    held.release();
    await walkP;

    expect(
      await backend.db
        .selectFrom("dayActivitySelections")
        .select("selected")
        .execute(),
    ).toEqual([{ selected: 1 }]);
  });

  it("should put back only the item of the tap that fails, and keep the draft for the tap that waits", async () => {
    const app = await setupTest();
    const { backend, frontend, logic, transport } = app;
    const today = todayOf(app);
    const held = transport.holdNextRequest();

    const walkP = logic.toggleActivity({ activityId: "activity-walk" });
    await held.reached;
    transport.failNextRequestAtGateway(503);
    await logic.toggleActivity({ activityId: "activity-music" });

    expect(logic.state.draft.activityIds).toEqual(["activity-walk"]);
    expect(logic.state.notice).toMatchObject({ kind: "error" });
    expect(logic.state.notice?.text).toMatch(/The activity was restored\.$/);
    expect(logic.plugins.selection.state.pendingKeys).toEqual([
      "activity:activity-walk",
    ]);
    expect(
      JSON.parse(frontend.browserStorage.getItem(draftKey(today)) ?? "{}").draft
        .activityIds,
    ).toEqual(["activity-walk"]);
    held.release();
    await walkP;

    expect(logic.state.draft.activityIds).toEqual(["activity-walk"]);
    expect(logic.state.notice).toMatchObject({ kind: "error" });
    expect(frontend.browserStorage.getItem(draftKey(today))).toEqual(null);
    expect(
      await backend.db
        .selectFrom("dayActivitySelections")
        .select("activityId")
        .execute(),
    ).toEqual([{ activityId: "activity-walk" }]);
  });
});
