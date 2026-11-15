import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import { seedCatalog, todayOf } from "./journal-test-helpers.js";
import { SelectionPlugin } from "./selection-plugin.js";

function setupTest(params: LogicTestParams = {}) {
  return setupLogicTest(params, async (app) => {
    await seedCatalog(app);
    return new SelectionPlugin(app.frontend);
  });
}

describe("SelectionPlugin tests", () => {
  it("should keep a mood on the server, and say which tap waits", async () => {
    const app = await setupTest();
    const { backend, logic, transport } = app;
    const today = todayOf(app);
    const held = transport.holdNextRequest();

    const tapP = logic.chooseMood({ logicalDate: today, moodId: "mood-bad" });
    expect(logic.isRunning).toEqual(true);
    expect(logic.state.pendingKeys).toEqual(["mood"]);
    await held.reached;
    held.release();
    const outcome = await tapP;

    expect(outcome).toEqual({ ok: true, result: undefined });
    expect(logic.isRunning).toEqual(false);
    expect(logic.state.pendingKeys).toEqual([]);
    expect(
      await backend.db
        .selectFrom("dayMoodSelections")
        .select("moodId")
        .execute(),
    ).toEqual([{ moodId: "mood-bad" }]);
  });

  it("should give the message when the server refuses a mood", async () => {
    const app = await setupTest();
    const { backend, logic } = app;

    const outcome = await logic.chooseMood({
      logicalDate: todayOf(app),
      moodId: "mood-nope",
    });

    expect(outcome).toEqual({
      ok: false,
      message: "Choose one of the five moods.",
    });
    expect(logic.state.pendingKeys).toEqual([]);
    expect(
      await backend.db.selectFrom("dayMoodSelections").selectAll().execute(),
    ).toEqual([]);
  });

  it("should keep an activity on the server, with the goals that follow it", async () => {
    const app = await setupTest();
    const { backend, logic } = app;
    const today = todayOf(app);

    const outcome = await logic.chooseActivity({
      logicalDate: today,
      activityId: "activity-gym",
      selected: true,
      linkedGoalIds: ["goal-move"],
    });

    expect(outcome).toMatchObject({
      ok: true,
      result: {
        selection: { activityId: "activity-gym", selected: true },
        affectedGoalCompletions: [{ goalId: "goal-move", completed: true }],
      },
    });
    expect(
      await backend.db.selectFrom("goalCompletions").select("goalId").execute(),
    ).toEqual([{ goalId: "goal-move" }]);
  });

  it("should call the answer out of date when the goals of the activity changed", async () => {
    const app = await setupTest();
    const { logic } = app;

    const outcome = await logic.chooseActivity({
      logicalDate: todayOf(app),
      activityId: "activity-gym",
      selected: true,
      linkedGoalIds: [],
    });

    expect(outcome).toEqual({
      ok: false,
      message: "The activity update was out of date.",
    });
  });

  it("should give the message when the server refuses an activity, or cannot be reached", async () => {
    const app = await setupTest();
    const { logic, transport } = app;
    const today = todayOf(app);

    expect(
      await logic.chooseActivity({
        logicalDate: today,
        activityId: "activity-nope",
        selected: true,
        linkedGoalIds: [],
      }),
    ).toEqual({ ok: false, message: "One activity is no longer available." });
    transport.goOffline();
    expect(
      await logic.chooseActivity({
        logicalDate: today,
        activityId: "activity-gym",
        selected: true,
        linkedGoalIds: ["goal-move"],
      }),
    ).toEqual({
      ok: false,
      message: "No connection. Check your internet connection and try again.",
    });
  });

  it("should keep a tap on each item while taps wait, and block only the items that a waiting tap changes", async () => {
    const app = await setupTest();
    const { backend, logic, transport } = app;
    const today = todayOf(app);
    const first = transport.holdNextRequest();
    const second = transport.holdNextRequest();

    const gymP = logic.chooseActivity({
      logicalDate: today,
      activityId: "activity-gym",
      selected: true,
      linkedGoalIds: ["goal-move"],
    });
    const moodP = logic.chooseMood({ logicalDate: today, moodId: "mood-bad" });
    await first.reached;
    await second.reached;

    expect(logic.state.pendingKeys).toEqual([
      "activity:activity-gym",
      "goal:goal-move",
      "mood",
    ]);
    expect(logic.isBlocked(["goal:goal-move"])).toEqual(true);
    expect(logic.isBlocked(["activity:activity-walk"])).toEqual(false);
    first.release();
    second.release();
    const outcomes = await Promise.all([gymP, moodP]);

    expect(outcomes.map((outcome) => outcome.ok)).toEqual([true, true]);
    expect(logic.isRunning).toEqual(false);
    expect(
      await backend.db
        .selectFrom("dayMoodSelections")
        .select("moodId")
        .execute(),
    ).toEqual([{ moodId: "mood-bad" }]);
    expect(
      await backend.db.selectFrom("goalCompletions").select("goalId").execute(),
    ).toEqual([{ goalId: "goal-move" }]);
  });
});
