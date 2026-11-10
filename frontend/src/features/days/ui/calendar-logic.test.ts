import { describe, expect, it } from "vitest";
import { addDays } from "@app/common/features/core/utils/logical-date";
import {
  setupLogicTest,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import { CalendarLogic } from "./calendar-logic.js";
import {
  saveOnAnotherDevice,
  seedCatalog,
  todayOf,
} from "./journal-test-helpers.js";

function setupTest(params: LogicTestParams & { month?: string } = {}) {
  const { month, ...rest } = params;
  return setupLogicTest(rest, async (app) => {
    await seedCatalog(app);
    const today = todayOf(app);
    return new CalendarLogic({
      ...app.frontend,
      initialMonth: month ?? today.slice(0, 7),
    });
  });
}

describe("CalendarLogic tests", () => {
  it("should list the days of the month that have an entry, with the mood the owner sees", async () => {
    const app = await setupTest({ skipInitialization: true });
    const { logic, transport } = app;
    const today = todayOf(app);
    await saveOnAnotherDevice(app, { logicalDate: today, moodId: "mood-good" });
    const held = transport.holdNextRequest();

    const initializeP = logic.initialize();
    await held.reached;
    expect(logic.state.loadMonthState).toEqual("running");
    held.release();
    await initializeP;

    expect(logic.state.month).toEqual(today.slice(0, 7));
    expect(logic.state.currentMonth).toEqual(today.slice(0, 7));
    expect(logic.state.days).toEqual([
      { logicalDate: today, moodId: "mood-good" },
    ]);
    expect(logic.state.loadMonthState).toEqual("success");
  });

  it("should show an earlier month, and come back, but never a later month", async () => {
    const app = await setupTest();
    const { logic } = app;
    const today = todayOf(app);
    const lastMonthDay = addDays(`${today.slice(0, 7)}-01`, -1);
    await saveOnAnotherDevice(app, {
      logicalDate: lastMonthDay,
      moodId: "mood-rad",
    });

    await logic.showMonth({ amount: 1 });
    expect(logic.state.month).toEqual(today.slice(0, 7));
    await logic.showMonth({ amount: -1 });

    expect(logic.state.month).toEqual(lastMonthDay.slice(0, 7));
    expect(logic.state.days).toEqual([
      { logicalDate: lastMonthDay, moodId: "mood-rad" },
    ]);
    await logic.showMonth({ amount: 1 });
    expect(logic.state.month).toEqual(today.slice(0, 7));
    expect(logic.state.days).toEqual([]);
  });

  it("should show the mood the owner tapped for a day that has an entry", async () => {
    const app = await setupTest({ skipInitialization: true });
    const { backend, logic } = app;
    const today = todayOf(app);
    await saveOnAnotherDevice(app, { logicalDate: today, moodId: "mood-good" });
    await backend.logic.days.setMood({
      logicalDate: today,
      moodId: "mood-awful",
    });

    await logic.initialize();

    expect(logic.state.days).toEqual([
      { logicalDate: today, moodId: "mood-awful" },
    ]);
  });

  it("should open the current month for a month that is not valid", async () => {
    const app = await setupTest({ month: "" });
    expect(app.logic.state.month).toEqual(todayOf(app).slice(0, 7));
  });

  it("should say so when the month cannot be read, and read it again", async () => {
    const app = await setupTest();
    const { logic, transport } = app;
    const month = logic.state.month;
    transport.goOffline();

    await logic.loadMonth();

    expect(logic.state.loadMonthState).toEqual("error");
    expect(logic.state.loadMonthError).toEqual(
      "No connection. Check your internet connection and try again.",
    );
    transport.goOnline();
    await logic.loadMonth();

    expect(logic.state.loadMonthState).toEqual("success");
    expect(logic.state.loadMonthError).toEqual(null);
    expect(logic.state.month).toEqual(month);
  });
});
