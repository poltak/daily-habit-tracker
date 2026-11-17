import { describe, expect, it } from "vitest";
import { addDays } from "@app/common/features/core/utils/logical-date";
import { save, saveFiveDays, saveRun, todayOf } from "./insights-test-setup.js";
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

describe("InsightsLogic the summary", () => {
  it("should give the good days, the average mood and the recorded days, with no change line for all time", async () => {
    const app = await setupTest({ seed: saveFiveDays });

    const { summary } = app.logic.view({ weekEndsOn: 0 });

    // Rad, Good, Meh, Good and Bad score 5, 4, 3, 4 and 2.
    expect(summary).toEqual({
      recordedDays: 5,
      goodShare: 0.6,
      meanMood: 3.6,
      change: null,
    });
  });

  it("should give dashes for a period without a recorded day", async () => {
    const app = await setupTest();

    expect(app.logic.view({ weekEndsOn: 0 }).summary).toEqual({
      recordedDays: 0,
      goodShare: null,
      meanMood: null,
      change: null,
    });
  });

  it("should compare the last 90 days with the 90 days before, only with 10 recorded days before", async () => {
    const app = await setupTest({
      seed: async (seeded) => {
        await saveRun(seeded, {
          endBack: 0,
          count: 20,
          moodId: () => "mood-good",
        });
        await saveRun(seeded, {
          endBack: 90,
          count: 9,
          moodId: () => "mood-bad",
        });
      },
    });
    const { logic } = app;
    logic.choosePeriod({ preset: "90d" });

    expect(logic.view({ weekEndsOn: 0 }).summary.change).toEqual(null);

    await saveRun(app, { endBack: 99, count: 1, moodId: () => "mood-good" });
    await logic.load();
    // Ten days before: nine bad and one good.
    expect(logic.view({ weekEndsOn: 0 }).summary).toMatchObject({
      goodShare: 1,
      change: { points: 90, against: "the 90 days before" },
    });
  });

  it("should name the period before for a year, for 365 days and for custom dates", async () => {
    const app = await setupTest({
      seed: async (seeded) => {
        for (let day = 1; day <= 10; day++) {
          const date = `2019-05-${String(day).padStart(2, "0")}`;
          await save(seeded, {
            logicalDate: date,
            moodId: day <= 3 ? "mood-good" : "mood-bad",
          });
        }
        for (let day = 1; day <= 4; day++) {
          await save(seeded, {
            logicalDate: `2020-05-0${day}`,
            moodId: day <= 2 ? "mood-good" : "mood-meh",
          });
        }
      },
    });
    const { logic } = app;

    logic.choosePeriod({ preset: "2020" });
    // 50% good days against 30%.
    expect(logic.view({ weekEndsOn: 0 }).summary.change).toEqual({
      points: 20,
      against: "2019",
    });

    logic.choosePeriod({ preset: "custom" });
    logic.setCustomStart({ value: "2020-05-01" });
    logic.setCustomEnd({ value: "2020-05-04" });
    expect(logic.view({ weekEndsOn: 0 }).summary.change).toEqual(null);
    logic.setCustomStart({ value: "2019-05-04" });
    logic.setCustomEnd({ value: "2019-05-10" });
    expect(logic.view({ weekEndsOn: 0 }).summary.change).toEqual(null);

    logic.choosePeriod({ preset: "1y" });
    expect(logic.view({ weekEndsOn: 0 }).summary.change).toEqual(null);
  });

  it("should write a fall as a negative number of points", async () => {
    const app = await setupTest({
      seed: async (seeded) => {
        await saveRun(seeded, {
          endBack: 0,
          count: 10,
          moodId: (back) => (back < 4 ? "mood-good" : "mood-bad"),
        });
        await saveRun(seeded, {
          endBack: 10,
          count: 10,
          moodId: () => "mood-good",
        });
      },
    });
    const { logic } = app;
    logic.choosePeriod({ preset: "custom" });
    logic.setCustomStart({ value: addDays(todayOf(app), -9) });
    logic.setCustomEnd({ value: todayOf(app) });

    expect(logic.view({ weekEndsOn: 0 }).summary).toMatchObject({
      goodShare: 0.4,
      change: { points: -60, against: "the 10 days before" },
    });
  });
});

describe("InsightsLogic the good days by month", () => {
  it("should give a row for each year, and the share and the bin of each month with days", async () => {
    const app = await setupTest({
      seed: async (seeded) => {
        const saved = [
          ["2020-11-03", "mood-good"],
          ["2020-11-04", "mood-rad"],
          ["2020-11-05", "mood-bad"],
          ["2020-12-24", "mood-rad"],
          ["2021-03-01", "mood-meh"],
          ["2021-03-02", "mood-awful"],
          ["2021-08-01", "mood-good"],
          ["2021-08-02", "mood-good"],
          ["2021-08-03", "mood-good"],
          ["2021-08-04", "mood-meh"],
          ["2021-08-05", "mood-good"],
          ["2021-08-06", "mood-good"],
          ["2021-08-07", "mood-good"],
          ["2021-08-08", "mood-meh"],
          ["2021-08-09", "mood-good"],
          ["2021-08-10", "mood-good"],
        ] as const;
        for (const [logicalDate, moodId] of saved) {
          await save(seeded, { logicalDate, moodId });
        }
      },
    });

    const { months } = app.logic.view({ weekEndsOn: 0 });

    expect(months.map((row) => row.year)).toEqual(["2020", "2021"]);
    const filled = (row: (typeof months)[number]) =>
      row.cells.flatMap((cell, index) =>
        cell ? [[index, cell.percent, cell.bin, cell.title]] : [],
      );
    expect(filled(months[0]!)).toEqual([
      [10, 67, 2, "Nov 2020: 67% good days (3 days)"],
      [11, 100, 4, "Dec 2020: 100% good days (1 day)"],
    ]);
    expect(filled(months[1]!)).toEqual([
      [2, 0, 1, "Mar 2021: 0% good days (2 days)"],
      [7, 80, 4, "Aug 2021: 80% good days (10 days)"],
    ]);
    expect(months[0]?.cells).toHaveLength(12);
  });
});
