import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import type { CatalogEvent } from "../types.js";
import { GoalSetupLogic } from "./goal-setup-logic.js";

function setupTest({
  goalId = "goal-read",
  ...params
}: LogicTestParams & { goalId?: string } = {}) {
  return setupLogicTest(params, async (app) => {
    await app.backend.logic.catalog.read();
    return new GoalSetupLogic({
      ...app.frontend,
      goalId,
      returnTo: "settings",
    });
  });
}

function recordEvents(app: {
  frontend: {
    catalogEvents: { listen: (l: (e: CatalogEvent) => void) => unknown };
  };
}) {
  const events: CatalogEvent[] = [];
  app.frontend.catalogEvents.listen((event) => {
    events.push(event);
  });
  return events;
}

describe("GoalSetupLogic loading", () => {
  it("should put the goal on the form", async () => {
    const { logic } = await setupTest();

    expect(logic.state).toMatchObject({
      name: "Read",
      repeatType: "daily",
      weekdaysMask: 127,
      targetPerWeek: 1,
      activityId: "activity-reading",
      materialIcon: "menu_book",
      loadGoalState: "success",
    });
    expect(logic.isDirty).toEqual(false);
    expect(logic.isBusy).toEqual(false);
  });

  it("should put a weekly goal on the form", async () => {
    const { logic } = await setupTest({ goalId: "goal-move" });

    expect(logic.state).toMatchObject({
      repeatType: "weekly",
      targetPerWeek: 3,
      activityId: "activity-gym",
    });
  });

  it("should have no goal for an ID that the catalog does not have", async () => {
    const { logic } = await setupTest({ goalId: "goal-missing" });

    expect(logic.state.goal).toEqual(null);
    expect(logic.state.loadGoalState).toEqual("success");
    expect(logic.isDirty).toEqual(false);
    await logic.save();
    expect(logic.state.notice).toEqual(null);
  });

  it("should not open an archived goal", async () => {
    const { logic, backend } = await setupTest({ skipInitialization: true });
    await backend.logic.catalog.updateGoal({
      id: "goal-read",
      patch: { archived: true },
    });
    await logic.initialize();

    expect(logic.state.goal).toEqual(null);
  });

  it("should say so when the catalog cannot be read", async () => {
    const { logic, transport } = await setupTest({ skipInitialization: true });
    transport.goOffline();
    await logic.initialize();

    expect(logic.state.loadGoalError).toEqual(
      "No connection. Check your internet connection and try again.",
    );
  });
});

describe("GoalSetupLogic editing and saving", () => {
  it("should save a new name, schedule and activity", async () => {
    const app = await setupTest();
    const { logic, backend } = app;
    const events = recordEvents(app);
    logic.setName({ name: "Read a chapter" });
    expect(logic.isDirty).toEqual(true);
    logic.setRepeat({ repeatType: "weekly" });
    logic.setTarget({ targetPerWeek: 5 });
    logic.setActivity({ activityId: "activity-music" });
    logic.openIconPicker();
    logic.chooseIcon({ icon: "pool" });
    expect(logic.state.iconPickerOpen).toEqual(false);

    await logic.save();

    expect(logic.state.notice).toEqual({
      kind: "success",
      text: "Goal updated.",
    });
    expect(logic.isDirty).toEqual(false);
    expect(logic.state.goal).toMatchObject({
      name: "Read a chapter",
      scheduleType: "times_per_week",
      targetPerWeek: 5,
      activityId: "activity-music",
      materialIcon: "pool",
    });
    expect(events).toEqual([{ type: "catalogChanged" }]);
    expect(
      await backend.db
        .selectFrom("goals")
        .select(["name", "weekdaysMask", "targetPerWeek"])
        .where("id", "=", "goal-read")
        .executeTakeFirst(),
    ).toEqual({ name: "Read a chapter", weekdaysMask: null, targetPerWeek: 5 });
  });

  it("should save the weekdays of a daily goal", async () => {
    const { logic } = await setupTest();
    logic.toggleWeekday({ index: 6 });
    logic.toggleWeekday({ index: 0 });

    await logic.save();

    expect(logic.state.goal).toMatchObject({
      scheduleType: "weekdays",
      weekdaysMask: 0b0111110,
    });
    expect(logic.state.weekdaysMask).toEqual(0b0111110);
  });

  it("should link a goal to no activity", async () => {
    const { logic } = await setupTest({ goalId: "goal-move" });
    logic.setActivity({ activityId: null });

    await logic.save();

    expect(logic.state.goal?.activityId).toEqual(null);
  });

  it("should refuse a goal with no name or no weekday, and send nothing", async () => {
    const { logic, transport } = await setupTest();
    transport.failNextRequestAtGateway(503);
    logic.setName({ name: "   " });

    await logic.save();
    expect(logic.state.notice).toEqual({
      kind: "error",
      text: "Goal name is required.",
    });
    logic.setName({ name: "Read" });
    for (let index = 0; index < 7; index += 1) {
      logic.toggleWeekday({ index });
    }
    await logic.save();

    expect(logic.state.notice).toEqual({
      kind: "error",
      text: "Choose at least one weekday for a daily goal.",
    });
    expect(logic.state.action).toEqual(null);
  });

  it("should refuse a weekly goal with no days per week", async () => {
    const { logic } = await setupTest({ goalId: "goal-move" });
    logic.setTarget({ targetPerWeek: 0 });

    await logic.save();

    expect(logic.state.notice?.text).toEqual(
      "Choose between 1 and 7 days per week.",
    );
  });

  it("should not save while the device is offline", async () => {
    const { logic, frontend } = await setupTest();
    logic.setName({ name: "Read more" });
    frontend.services.device.setOnline(false);

    await logic.save();

    expect(logic.state.notice?.text).toEqual(
      "You’re offline. Reconnect before updating a goal.",
    );
  });

  it("should keep the form and say that the goal was restored when the server refuses", async () => {
    const { logic, backend } = await setupTest();
    logic.setName({ name: "Read more" });
    await backend.logic.catalog.deleteGoal({ id: "goal-read" });

    await logic.save();

    expect(logic.state.notice).toEqual({
      kind: "error",
      text: "Goal not found. The goal was restored.",
    });
    expect(logic.state.name).toEqual("Read more");
    expect(logic.state.goal?.name).toEqual("Read");
    expect(logic.isBusy).toEqual(false);
  });

  it("should not let the owner leave, or save again, while the goal saves", async () => {
    const { logic, transport } = await setupTest();
    expect(logic.canLeave()).toEqual(true);
    logic.setName({ name: "Read more" });
    const held = transport.holdNextRequest();

    const saving = logic.save();
    await held.reached;
    expect(logic.isBusy).toEqual(true);
    expect(logic.canLeave()).toEqual(false);
    expect(logic.state.notice?.text).toEqual(
      "Wait for the goal update to finish before leaving this goal.",
    );
    await logic.save();
    held.release();
    await saving;

    expect(logic.state.goal?.name).toEqual("Read more");
  });
});

describe("GoalSetupLogic archiving and deleting", () => {
  it("should archive the goal, and leave a notice for the Setup page", async () => {
    const app = await setupTest();
    const { logic, backend } = app;
    const events = recordEvents(app);

    expect(await logic.archive()).toEqual(true);

    expect(events).toEqual([
      {
        type: "catalogChanged",
        notice: {
          target: "settings",
          text: "Archived “Read”. You can restore it in Setup.",
        },
      },
    ]);
    expect(
      (
        await backend.db
          .selectFrom("goals")
          .select("archivedAt")
          .where("id", "=", "goal-read")
          .executeTakeFirst()
      )?.archivedAt,
    ).not.toEqual(null);
  });

  it("should delete the goal after the warning", async () => {
    const app = await setupTest();
    const { logic, frontend, backend } = app;
    const events = recordEvents(app);

    expect(await logic.remove()).toEqual(true);

    expect(frontend.services.dialogs.questions).toEqual([
      "Delete the goal “Read”?\n\nThis also deletes all of its completion history. You cannot recover a deleted goal. To hide the goal and keep its history, archive it instead.",
    ]);
    expect(events[0]).toMatchObject({
      notice: { target: "settings", text: "Deleted “Read”." },
    });
    expect(await backend.db.selectFrom("goals").select("id").execute()).toEqual(
      [{ id: "goal-move" }],
    );
  });

  it("should keep the goal when the owner does not agree to the delete", async () => {
    const { logic, frontend, backend } = await setupTest();
    frontend.services.dialogs.answerWith(false);

    expect(await logic.remove()).toEqual(false);

    expect(
      await backend.db.selectFrom("goals").select("id").execute(),
    ).toHaveLength(2);
  });

  it("should do nothing without a goal", async () => {
    const { logic, frontend } = await setupTest({ goalId: "goal-missing" });

    expect(await logic.remove()).toEqual(false);
    expect(await logic.archive()).toEqual(false);

    expect(frontend.services.dialogs.questions).toEqual([]);
  });

  it("should not archive while the device is offline", async () => {
    const { logic, frontend } = await setupTest();
    frontend.services.device.setOnline(false);

    expect(await logic.archive()).toEqual(false);

    expect(logic.state.notice?.text).toEqual(
      "You’re offline. Reconnect before updating a goal.",
    );
  });

  it("should say why a goal cannot be deleted", async () => {
    const { logic, backend } = await setupTest();
    await backend.logic.catalog.deleteGoal({ id: "goal-read" });

    expect(await logic.remove()).toEqual(false);

    expect(logic.state.notice).toEqual({
      kind: "error",
      text: "Goal not found.",
    });
    expect(logic.isBusy).toEqual(false);
  });

  it("should not archive twice at once", async () => {
    const { logic, transport } = await setupTest();
    const held = transport.holdNextRequest();

    const first = logic.archive();
    await held.reached;
    expect(await logic.archive()).toEqual(false);
    held.release();

    expect(await first).toEqual(true);
  });
});
