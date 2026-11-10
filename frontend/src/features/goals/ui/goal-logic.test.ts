import { describe, expect, it } from "vitest";
import { addDays } from "@app/common/features/core/utils/logical-date";
import {
  setupLogicTest,
  type FullApplication,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import { GoalLogic } from "./goal-logic.js";

function todayOf(app: FullApplication): string {
  return new Date(app.frontend.services.clock.now()).toISOString().slice(0, 10);
}

function setupTest(
  params: LogicTestParams & { goalId?: string; month?: string } = {},
) {
  const { goalId = "goal-move", month, ...rest } = params;
  return setupLogicTest(rest, async (app) => {
    await app.backend.logic.catalog.read();
    return new GoalLogic({
      ...app.frontend,
      goalId,
      initialMonth: month ?? todayOf(app).slice(0, 7),
    });
  });
}

describe("GoalLogic tests", () => {
  it("should load the month with the completed days and the result of each week", async () => {
    const app = await setupTest({ skipInitialization: true });
    const { backend, logic, transport } = app;
    const today = todayOf(app);
    await backend.logic.days.setGoalCompletion({
      logicalDate: today,
      goalId: "goal-move",
      completed: true,
    });
    const held = transport.holdNextRequest();

    const initializeP = logic.initialize();
    await held.reached;
    expect(logic.state.loadHistoryState).toEqual("running");
    held.release();
    await initializeP;

    const { history } = logic.state;
    expect(logic.state.loadHistoryState).toEqual("success");
    expect(history?.month).toEqual(today.slice(0, 7));
    expect(history?.asOf).toEqual(today);
    expect(history?.days.filter((day) => day.completed)).toEqual([
      { logicalDate: today, completed: true, scheduled: true },
    ]);
    const week = history?.weeks.find(
      (candidate) => candidate.weekStart <= today && today <= candidate.weekEnd,
    );
    expect(week).toMatchObject({
      status: "in_progress",
      completedCount: 1,
      expectedCount: 3,
    });
  });

  it("should end the weeks on the day of the settings", async () => {
    const app = await setupTest({ skipInitialization: true });
    const { backend, logic } = app;
    await backend.db
      .insertInto("appSettings")
      .values({ key: "week_ends_on", value: "3" })
      .execute();

    await logic.initialize();

    expect(logic.state.weekEndsOn).toEqual(3);
    for (const week of logic.state.history?.weeks ?? []) {
      expect(new Date(`${week.weekEnd}T12:00:00Z`).getUTCDay()).toEqual(3);
    }
  });

  it("should count a day before the start date, and move the start date back to it", async () => {
    const app = await setupTest({ skipInitialization: true });
    const { backend } = app;
    const today = todayOf(app);
    const earlier = addDays(today, -40);
    await backend.db
      .updateTable("goals")
      .set({ startDate: today })
      .where("id", "=", "goal-read")
      .execute();
    await backend.logic.days.setGoalCompletion({
      logicalDate: earlier,
      goalId: "goal-read",
      completed: true,
    });
    const goalId = "goal-read";

    const earlierLogic = new GoalLogic({
      ...app.frontend,
      goalId,
      initialMonth: earlier.slice(0, 7),
    });
    await earlierLogic.initialize();

    expect(
      earlierLogic.state.history?.days.find(
        (day) => day.logicalDate === earlier,
      ),
    ).toEqual({ logicalDate: earlier, completed: true, scheduled: true });
    expect(earlierLogic.state.history?.goal.startDate).toEqual(today);
    earlierLogic.cleanup();
  });

  it("should show an earlier month and come back, without the old month in between", async () => {
    const app = await setupTest();
    const { logic, transport } = app;
    const month = logic.state.month;
    const held = transport.holdNextRequest();

    const showP = logic.showMonth({ amount: -1 });
    expect(logic.state.history).toEqual(null);
    await logic.showMonth({ amount: -1 });
    await held.reached;
    held.release();
    await showP;

    expect(logic.state.month).not.toEqual(month);
    expect(logic.state.history?.month).toEqual(logic.state.month);
    await logic.showMonth({ amount: 1 });
    expect(logic.state.month).toEqual(month);
    expect(logic.state.history?.month).toEqual(month);
  });

  it("should say so when the history cannot be read, and read it again", async () => {
    const app = await setupTest();
    const { logic, transport } = app;
    transport.goOffline();

    await logic.loadHistory();

    expect(logic.state.loadHistoryState).toEqual("error");
    expect(logic.state.loadHistoryError).toEqual(
      "No connection. Check your internet connection and try again.",
    );
    transport.goOnline();
    await logic.loadHistory();

    expect(logic.state.loadHistoryState).toEqual("success");
    expect(logic.state.loadHistoryError).toEqual(null);
    expect(logic.state.history?.goal.id).toEqual("goal-move");
  });

  it("should say so when the goal is gone", async () => {
    const app = await setupTest({ goalId: "goal-gone" });

    expect(app.logic.state.loadHistoryState).toEqual("error");
    expect(app.logic.state.loadHistoryError).toEqual("Goal not found.");
    expect(app.logic.state.history).toEqual(null);
  });

  it("should open the month of today for a month that is not valid", async () => {
    const app = await setupTest({ month: "" });
    expect(app.logic.state.month).toEqual(todayOf(app).slice(0, 7));
  });
});
