import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import { WeekLogic } from "./week-logic.js";

function setupTest(params: LogicTestParams = {}) {
  return setupLogicTest(params, (app) => new WeekLogic(app.frontend));
}

describe("WeekLogic tests", () => {
  it("should end the week on Sunday when nothing is saved", async () => {
    const { logic } = await setupTest();

    expect(logic.state.loadState).toEqual("success");
    expect(logic.state.weekEndsOn).toEqual(0);
  });

  it("should read the day that the old app saved", async () => {
    const { backend, logic } = await setupTest({ skipInitialization: true });
    await backend.db
      .insertInto("appSettings")
      .values({
        key: "week_ends_on",
        value: "4",
        updatedAt: "2025-01-01T00:00:00.000Z",
      })
      .execute();

    await logic.initialize();

    expect(logic.state.weekEndsOn).toEqual(4);
  });

  it("should read a saved value that is not a weekday as the default", async () => {
    const { backend, logic } = await setupTest({ skipInitialization: true });
    await backend.db
      .insertInto("appSettings")
      .values({
        key: "week_ends_on",
        value: "9",
        updatedAt: "2025-01-01T00:00:00.000Z",
      })
      .execute();

    await logic.initialize();

    expect(logic.state.weekEndsOn).toEqual(0);
  });

  it("should show the error when the setting cannot be read without a session", async () => {
    const { logic } = await setupTest({ authenticated: false });

    expect(logic.state.loadState).toEqual("error");
    expect(logic.state.loadError).toEqual("Sign in to continue.");
  });

  it("should save the day, and replace the saved day on a second change", async () => {
    const { backend, logic } = await setupTest();

    const saveP = logic.changeWeekEnd({ weekEndsOn: 6 });
    expect(logic.state.saveState).toEqual("running");
    await saveP;
    expect(logic.state.saveState).toEqual("success");
    expect(logic.state.weekEndsOn).toEqual(6);
    await logic.changeWeekEnd({ weekEndsOn: 2 });

    expect(logic.state.weekEndsOn).toEqual(2);
    expect(
      await backend.db.selectFrom("appSettings").selectAll().execute(),
    ).toMatchObject([{ key: "week_ends_on", value: "2" }]);
  });

  it("should refuse a day that is not a weekday, and keep the saved day", async () => {
    const { logic } = await setupTest();
    await logic.changeWeekEnd({ weekEndsOn: 3 });

    await logic.changeWeekEnd({ weekEndsOn: 7 });

    expect(logic.state.saveState).toEqual("error");
    expect(logic.state.saveError).toEqual(
      "Choose a weekday for the end of the week.",
    );
    expect(logic.state.weekEndsOn).toEqual(3);
  });

  it("should show the error when the day cannot be saved without a session", async () => {
    const { logic } = await setupTest({ authenticated: false });

    await logic.changeWeekEnd({ weekEndsOn: 3 });

    expect(logic.state.saveState).toEqual("error");
    expect(logic.state.saveError).toEqual("Sign in to continue.");
    expect(logic.state.weekEndsOn).toEqual(0);
  });
});
