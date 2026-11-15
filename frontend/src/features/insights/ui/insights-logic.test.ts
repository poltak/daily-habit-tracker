import { describe, expect, it } from "vitest";
import {
  addDays,
  dayOfWeek,
} from "@app/common/features/core/utils/logical-date";
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

function todayOf(app: FullApplication): string {
  return new Date(app.frontend.services.clock.now()).toISOString().slice(0, 10);
}

/** Save a day on the backend, as another device of the owner does. */
function save(
  app: FullApplication,
  input: { logicalDate: string; moodId: string; activityIds?: string[] },
) {
  return app.backend.logic.days.saveEntry({
    logicalDate: input.logicalDate,
    input: {
      moodId: input.moodId,
      activityIds: input.activityIds ?? [],
      completedGoalIds: [],
    },
  });
}

/** Five days up to today: Gym on the good days, Cook on the bad ones. */
async function saveFiveDays(app: FullApplication) {
  const today = todayOf(app);
  const days = [
    { back: 0, moodId: "mood-rad", activityIds: ["activity-gym"] },
    { back: 1, moodId: "mood-good", activityIds: ["activity-gym"] },
    { back: 2, moodId: "mood-meh", activityIds: ["activity-cook"] },
    {
      back: 3,
      moodId: "mood-good",
      activityIds: ["activity-gym", "activity-reading"],
    },
    { back: 4, moodId: "mood-bad", activityIds: ["activity-cook"] },
  ];
  for (const day of days) {
    await save(app, {
      logicalDate: addDays(today, -day.back),
      moodId: day.moodId,
      activityIds: day.activityIds,
    });
  }
  return today;
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
  it("should count all the recorded days, the share of days and the activities", async () => {
    const app = await setupTest({ seed: saveFiveDays });

    const period = app.logic.period();

    expect(period).toMatchObject({
      validRange: true,
      calendarDays: 5,
      activityCount: 3,
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
    expect(logic.period().calendarDays).toEqual(2);
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

describe("InsightsLogic the activities", () => {
  it("should rank the activities by the mood on the days that have them", async () => {
    const app = await setupTest({ seed: saveFiveDays });

    const view = app.logic.relationships();

    expect(view.activityId).toEqual("activity-gym");
    const ranked = view.associations.map((association) => [
      association.activityId,
      association.recorded.sampleSize,
      association.meanDifference?.toFixed(2) ?? null,
    ]);
    expect(ranked[0]).toEqual(["activity-gym", 3, "1.83"]);
    expect(ranked[1]).toEqual(["activity-reading", 1, "0.50"]);
    expect(ranked.find(([id]) => id === "activity-cook")).toEqual([
      "activity-cook",
      2,
      "-1.83",
    ]);
    expect(ranked.map(([id]) => id).indexOf("activity-cook")).toEqual(2);
    expect(ranked.find(([id]) => id === "activity-sleep")).toEqual([
      "activity-sleep",
      0,
      null,
    ]);
    expect(view.selectedAssociation?.activityId).toEqual("activity-gym");
    expect(view.calendarComparison?.anchorCounts).toEqual({
      recorded: 3,
      notRecorded: 2,
    });
  });

  it("should compare the calendar days around an activity day", async () => {
    const app = await setupTest({ seed: saveFiveDays });

    app.logic.chooseActivity({ activityId: "activity-cook" });
    const comparison = app.logic.relationships().calendarComparison;

    expect(comparison?.activityId).toEqual("activity-cook");
    expect(comparison?.offsets.map((offset) => offset.label)).toEqual([
      "Previous calendar day",
      "Same calendar day",
      "Next calendar day",
      "+2 calendar days",
    ]);
    const nextDay = comparison?.offsets[2];
    expect(nextDay?.recorded.sampleSize).toEqual(2);
    expect(nextDay?.notRecorded.sampleSize).toEqual(2);
  });

  it("should change the ranking with the year and the weekday, and fall back to all years", async () => {
    const app = await setupTest({ seed: saveFiveDays });
    const today = todayOf(app);
    const { logic } = app;

    logic.chooseRelationshipWeekday({ value: String(dayOfWeek(today)) });
    expect(
      logic
        .relationships()
        .associations.find(
          (association) => association.activityId === "activity-gym",
        )?.recorded.sampleSize,
    ).toEqual(1);
    logic.chooseRelationshipWeekday({ value: "all" });
    logic.chooseRelationshipYear({ value: "1999" });
    expect(logic.relationships().year).toEqual("all");
    logic.chooseRelationshipYear({ value: today.slice(0, 4) });
    expect(logic.relationships().year).toEqual(today.slice(0, 4));
    expect(logic.relationships().associations).toHaveLength(12);
  });

  it("should pick another activity when the chosen one is not in the list", async () => {
    const app = await setupTest({ seed: saveFiveDays });

    app.logic.chooseActivity({ activityId: "activity-unknown" });

    expect(app.logic.relationships().activityId).toEqual("activity-gym");
  });

  it("should suggest pairs only with ten known moods in each group, and fall back to a sparse pair", async () => {
    const app = await setupTest({ seed: saveFiveDays });
    const today = todayOf(app);
    const { logic } = app;

    const sparse = logic.relationships();
    expect(sparse.suggestions).toEqual([]);
    expect(sparse.selectedPair).toMatchObject({ adequate: false });
    expect(sparse.pairActivityAId).not.toEqual(sparse.pairActivityBId);

    for (let back = 5; back < 45; back += 1) {
      await save(app, {
        logicalDate: addDays(today, -back),
        moodId:
          ["mood-good", "mood-bad", "mood-meh", "mood-rad"][back % 4] ?? "",
        activityIds: [
          ...(back % 2 === 0 ? ["activity-gym"] : []),
          ...(back % 4 < 2 ? ["activity-cook"] : []),
        ],
      });
    }
    await logic.load();
    const rich = logic.relationships();

    expect(rich.suggestions[0]).toMatchObject({
      pairKey: "activity-cook::activity-gym",
      adequate: true,
    });
    logic.choosePair({
      activityAId: "activity-gym",
      activityBId: "activity-reading",
    });
    expect(logic.relationships()).toMatchObject({
      pairActivityAId: "activity-gym",
      pairActivityBId: "activity-reading",
    });
    logic.chooseFirstOfPair({ activityId: "activity-cook" });
    logic.chooseSecondOfPair({ activityId: "activity-cook" });
    const fallback = logic.relationships();
    expect(fallback.pairActivityAId).toEqual("activity-cook");
    expect(fallback.pairActivityBId).not.toEqual("activity-cook");
  });

  it("should start the choices again after the period has no days", async () => {
    const app = await setupTest({ seed: saveFiveDays });
    const { logic } = app;
    logic.chooseActivity({ activityId: "activity-cook" });
    logic.chooseOverlayActivity({ activityId: "activity-gym" });
    logic.choosePeriod({ preset: "custom" });
    logic.setCustomStart({ value: "2001-01-01" });
    expect(logic.state.activityId).toEqual("activity-cook");

    logic.setCustomEnd({ value: "2001-01-31" });

    expect(logic.period().showAnalysis).toEqual(false);
    expect(logic.state).toMatchObject({
      activityId: "",
      overlayActivityId: "",
    });
    logic.choosePeriod({ preset: "all" });
    expect(logic.relationships().activityId).toEqual("activity-gym");
  });
});

describe("InsightsLogic the rhythms", () => {
  it("should average the mood on each weekday and each month", async () => {
    const app = await setupTest({ seed: saveFiveDays });

    const view = app.logic.rhythms({ weekEndsOn: 0 });

    expect(view.analysis.loggedCount).toEqual(5);
    const weekdays = view.analysis.weekdays.filter(
      (bucket) => bucket.count > 0,
    );
    expect(weekdays.map((bucket) => bucket.mean).toSorted()).toEqual([
      2, 3, 4, 4, 5,
    ]);
    expect(
      view.analysis.months.reduce((sum, bucket) => sum + bucket.count, 0),
    ).toEqual(5);
    expect(view.analysis.years).toHaveLength(1);
    expect(view.overlayActivityName).toEqual(null);
  });

  it("should overlay an activity as a fraction of the logged days, and filter by year", async () => {
    const app = await setupTest({ seed: saveFiveDays });
    const { logic } = app;

    logic.chooseOverlayActivity({ activityId: "activity-gym" });
    const view = logic.rhythms({ weekEndsOn: 0 });

    expect(view.overlayActivityName).toEqual("Gym");
    const fractions = view.analysis.weekdays
      .filter((bucket) => bucket.loggedCount > 0)
      .map((bucket) => bucket.activityFrequency?.fraction);
    expect(fractions.toSorted()).toEqual([0, 0, 1, 1, 1]);
    logic.chooseRhythmYear({ value: "1999" });
    expect(logic.rhythms({ weekEndsOn: 0 }).year).toEqual("");
    logic.chooseRhythmYear({ value: todayOf(app).slice(0, 4) });
    expect(logic.rhythms({ weekEndsOn: 0 }).year).toEqual(
      todayOf(app).slice(0, 4),
    );
  });

  it("should split the ended weeks into higher-mood and typical weeks, for the day on which a week ends", async () => {
    // The clock of the test device follows the real clock.
    const today = new Date().toISOString().slice(0, 10);
    const lastSunday = addDays(today, -(dayOfWeek(today) || 7));
    // The first week starts at the oldest recorded day, so the older week is whole only if its first day is recorded.
    const weeks = [
      { offsets: [0, 1, 2, 3], moodId: "mood-rad", activityId: "activity-gym" },
      {
        offsets: [7, 8, 9, 13],
        moodId: "mood-bad",
        activityId: "activity-cook",
      },
    ];
    const app = await setupTest({
      seed: async (seeded) => {
        for (const week of weeks) {
          for (const offset of week.offsets) {
            await save(seeded, {
              logicalDate: addDays(lastSunday, -offset),
              moodId: week.moodId,
              activityIds: [week.activityId],
            });
          }
        }
      },
    });

    const { bestWeeks } = app.logic.rhythms({ weekEndsOn: 0 });

    expect(bestWeeks).toMatchObject({
      weekRange: "Monday–Sunday",
      qualifyingWeekCount: 2,
      moodLoggedWeekCount: 2,
      higher: { weekCount: 1, moodMean: 5 },
      typical: { weekCount: 1, moodMean: 2 },
    });
    expect(bestWeeks.higherWeeks[0]?.weekEnd).toEqual(lastSunday);
    expect(
      bestWeeks.activityComparisons.find(
        (comparison) => comparison.activityId === "activity-gym",
      ),
    ).toMatchObject({ higherFrequency: 1, typicalFrequency: 0, difference: 1 });
    expect(app.logic.rhythms({ weekEndsOn: 3 }).bestWeeks.weekRange).toEqual(
      "Thursday–Wednesday",
    );
  });
});
