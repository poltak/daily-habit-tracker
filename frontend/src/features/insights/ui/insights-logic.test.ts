import { describe, expect, it } from "vitest";
import { addDays } from "@app/common/features/core/utils/logical-date";
import { save, saveFiveDays, todayOf } from "./insights-test-setup.js";
import {
  setupLogicTest,
  type FullApplication,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import { InsightsLogic } from "./insights-logic.js";

/** `seed` saves days on the backend before the Logic reads the history. */
function setupTest(
  params: LogicTestParams & {
    seed?: (app: FullApplication) => Promise<unknown>;
  } = {},
) {
  const { seed, ...rest } = params;
  return setupLogicTest(rest, async (app) => {
    await app.backend.logic.catalog.read();
    await seed?.(app);
    return new InsightsLogic(app.frontend);
  });
}

describe("InsightsLogic loading the history", () => {
  it("should read the catalog and the saved days, with the taps that wait for a save", async () => {
    const app = await setupTest({ skipInitialization: true });
    const { backend, logic, transport } = app;
    const today = todayOf(app);
    await save(app, {
      logicalDate: addDays(today, -1),
      moodId: "mood-good",
      activityIds: ["activity-gym"],
    });
    await save(app, { logicalDate: today, moodId: "mood-meh" });
    await backend.logic.days.setMood({
      logicalDate: today,
      moodId: "mood-rad",
    });
    await backend.logic.days.setActivity({
      logicalDate: today,
      activityId: "activity-cook",
      selected: true,
    });
    // A day that the owner only tapped has no entry yet.
    await backend.logic.days.setMood({
      logicalDate: addDays(today, -2),
      moodId: "mood-bad",
    });
    const held = transport.holdNextRequest();

    const initializeP = logic.initialize();
    await held.reached;
    expect(logic.state).toMatchObject({ loadState: "running", data: null });
    held.release();
    await initializeP;

    expect(logic.state).toMatchObject({
      loadState: "success",
      loadError: null,
    });
    expect(logic.state.data?.moods.map((mood) => mood.id)).toEqual([
      "mood-rad",
      "mood-good",
      "mood-meh",
      "mood-bad",
      "mood-awful",
    ]);
    expect(logic.state.data?.groups).toHaveLength(5);
    expect(logic.state.data?.activities).toHaveLength(12);
    expect(logic.state.data?.days).toEqual([
      {
        logicalDate: addDays(today, -1),
        moodId: "mood-good",
        activityIds: ["activity-gym"],
      },
      {
        logicalDate: today,
        moodId: "mood-rad",
        activityIds: ["activity-cook"],
      },
    ]);
  });

  it("should read every day of a long history, also past the limit of bound values", async () => {
    const app = await setupTest({ skipInitialization: true });
    const today = todayOf(app);
    const history = Array.from({ length: 130 }, (_, back) => ({
      logicalDate: addDays(today, -back),
      moodId: back % 2 === 0 ? "mood-good" : "mood-bad",
      activityIds: back % 3 === 0 ? ["activity-gym"] : [],
    }));
    for (const day of history) {
      await save(app, day);
    }

    await app.logic.initialize();

    const days = app.logic.state.data?.days ?? [];
    expect(days).toHaveLength(130);
    expect(days.filter((day) => day.activityIds.length > 0)).toHaveLength(44);
    expect(days[0]?.logicalDate).toEqual(addDays(today, -129));
    expect(app.logic.period().days).toHaveLength(130);
  });

  it("should say so when the history cannot be read, and read it again", async () => {
    const app = await setupTest({ skipInitialization: true });
    const { logic, transport } = app;
    await saveFiveDays(app);
    transport.goOffline();

    await logic.initialize();

    expect(logic.state).toMatchObject({
      loadState: "error",
      loadError: "No connection. Check your internet connection and try again.",
      data: null,
    });
    transport.goOnline();
    await logic.load();

    expect(logic.state).toMatchObject({
      loadState: "success",
      loadError: null,
    });
    expect(logic.state.data?.days).toHaveLength(5);
  });

  it("should send one request when the owner asks again while the first runs", async () => {
    const app = await setupTest({ skipInitialization: true });
    const { logic, transport } = app;
    const held = transport.holdNextRequest();

    const firstP = logic.load();
    await held.reached;
    const secondP = logic.load();
    held.release();
    await Promise.all([firstP, secondP]);

    expect(logic.state.loadState).toEqual("success");
    expect(logic.state.data?.days).toEqual([]);
  });

  it("should refuse the history without a session", async () => {
    const app = await setupTest({ authenticated: false });

    expect(app.logic.state).toMatchObject({
      loadState: "error",
      data: null,
    });
  });
});

describe("InsightsLogic the period", () => {
  it("should count all the recorded days", async () => {
    const app = await setupTest({ seed: saveFiveDays });

    const period = app.logic.period();

    expect(period).toMatchObject({
      validRange: true,
      showAnalysis: true,
    });
    expect(period.days).toHaveLength(5);
    expect(period.years).toEqual([todayOf(app).slice(0, 4)]);
  });

  it("should not show the analysis for a journal without days", async () => {
    const app = await setupTest();
    const today = todayOf(app);

    expect(app.logic.period()).toMatchObject({
      days: [],
      history: [],
      range: { startDate: today, endDate: today },
      showAnalysis: false,
    });
  });

  it("should keep only the days of the last 90 days, of a year, or of custom dates", async () => {
    const app = await setupTest({
      seed: async (seeded) => {
        const day = todayOf(seeded);
        await saveFiveDays(seeded);
        await save(seeded, {
          logicalDate: addDays(day, -89),
          moodId: "mood-good",
        });
        await save(seeded, {
          logicalDate: addDays(day, -90),
          moodId: "mood-good",
        });
        await save(seeded, { logicalDate: "2020-03-04", moodId: "mood-rad" });
      },
    });
    const today = todayOf(app);
    const { logic } = app;

    expect(logic.period().days).toHaveLength(8);
    logic.choosePeriod({ preset: "90d" });
    expect(logic.period().days).toHaveLength(6);
    expect(logic.period().range).toEqual({
      startDate: addDays(today, -89),
      endDate: today,
    });
    logic.choosePeriod({ preset: "1y" });
    expect(logic.period().days).toHaveLength(7);
    logic.choosePeriod({ preset: "2020" });
    expect(logic.period().days.map((day) => day.logicalDate)).toEqual([
      "2020-03-04",
    ]);
    expect(logic.period().range).toEqual({
      startDate: "2020-01-01",
      endDate: "2020-12-31",
    });
    expect(logic.period().years).toContain("2020");
    logic.choosePeriod({ preset: "custom" });
    expect(logic.state).toMatchObject({
      customStart: "2020-01-01",
      customEnd: "2020-12-31",
    });
    logic.setCustomStart({ value: addDays(today, -1) });
    logic.setCustomEnd({ value: today });
    expect(logic.period().days).toHaveLength(2);
  });

  it("should refuse a range that ends before it starts, or after today", async () => {
    const app = await setupTest({ seed: saveFiveDays });
    const today = todayOf(app);
    const { logic } = app;
    logic.choosePeriod({ preset: "custom" });

    logic.setCustomStart({ value: today });
    logic.setCustomEnd({ value: addDays(today, -2) });
    expect(logic.period()).toMatchObject({
      validRange: false,
      days: [],
      showAnalysis: false,
    });
    logic.setCustomStart({ value: addDays(today, -2) });
    logic.setCustomEnd({ value: addDays(today, 1) });
    expect(logic.period().validRange).toEqual(false);
    logic.setCustomEnd({ value: "" });
    expect(logic.period().validRange).toEqual(false);
    logic.setCustomEnd({ value: today });
    expect(logic.period()).toMatchObject({
      validRange: true,
      showAnalysis: true,
    });
  });

  it("should leave out a day that is later than today", async () => {
    const app = await setupTest({ seed: saveFiveDays });
    const today = todayOf(app);
    await app.backend.db
      .insertInto("entries")
      .values({
        id: "entry-later",
        logicalDate: addDays(today, 2),
        moodId: "mood-rad",
      })
      .execute();

    await app.logic.load();

    expect(app.logic.state.data?.days).toHaveLength(6);
    expect(app.logic.period().days).toHaveLength(5);
  });
});
