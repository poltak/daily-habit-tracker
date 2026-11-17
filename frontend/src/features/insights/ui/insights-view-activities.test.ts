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

describe("InsightsLogic the better and worse days", () => {
  it("should list the activities with enough days on both sides, the better one first", async () => {
    const app = await setupTest({ seed: saveFiveDays });

    const links = app.logic.view({ weekEndsOn: 0 }).moodLinks;

    // Five days: 2 days on each side are enough. Reading has one day.
    expect(links.minDays).toEqual(2);
    expect(
      links.whatYouDo.map((item) => [
        item.name,
        item.days,
        item.difference.toFixed(2),
        item.length,
      ]),
    ).toEqual([
      ["Gym", 3, "1.83", 1],
      ["Cook", 2, "-1.83", 1],
    ]);
    expect(links.howYouFelt).toEqual(null);
  });

  it("should split the activities of a feelings group from the others", async () => {
    let calmId = "";
    let tenseId = "";
    const app = await setupTest({
      seed: async (seeded) => {
        const { catalogChange } = seeded.backend.logic;
        const group = await catalogChange.createGroup({ name: "Feelings" });
        calmId = (
          await catalogChange.createActivity({
            name: "Calm",
            groupId: group.id,
          })
        ).id;
        tenseId = (
          await catalogChange.createActivity({
            name: "Tense",
            groupId: group.id,
          })
        ).id;
        const today = todayOf(seeded);
        const days = [
          { moodId: "mood-rad", activityIds: ["activity-gym", calmId] },
          { moodId: "mood-good", activityIds: ["activity-gym", calmId] },
          { moodId: "mood-meh", activityIds: [tenseId] },
          { moodId: "mood-good", activityIds: ["activity-gym", calmId] },
          { moodId: "mood-bad", activityIds: [tenseId] },
        ];
        for (const [back, day] of days.entries()) {
          await save(seeded, { logicalDate: addDays(today, -back), ...day });
        }
      },
    });

    const links = app.logic.view({ weekEndsOn: 0 }).moodLinks;

    expect(links.whatYouDo.map((item) => item.name)).toEqual(["Gym"]);
    expect(links.howYouFelt?.map((item) => item.name)).toEqual([
      "Calm",
      "Tense",
    ]);
    expect(links.howYouFelt?.map((item) => item.activityId)).toEqual([
      calmId,
      tenseId,
    ]);
    expect(links.howYouFelt?.[1]?.difference).toBeLessThan(0);
  });

  it("should ask for 10 days on each side once the period has 50 days or more", async () => {
    const app = await setupTest({
      seed: async (seeded) => {
        const today = todayOf(seeded);
        for (let back = 0; back < 130; back++) {
          // Gym has 13 days, all good. Cook has 9 days, all rad.
          const gym = back % 10 === 5;
          const cook = back < 9;
          await save(seeded, {
            logicalDate: addDays(today, -back),
            moodId: cook ? "mood-rad" : gym ? "mood-good" : "mood-bad",
            activityIds: [
              ...(gym ? ["activity-gym"] : []),
              ...(cook ? ["activity-cook"] : []),
            ],
          });
        }
      },
    });

    const links = app.logic.view({ weekEndsOn: 0 }).moodLinks;

    expect(links.minDays).toEqual(10);
    expect(links.whatYouDo.map((item) => item.name)).toEqual(["Gym"]);
  });

  it("should give empty lists when no activity has enough days", async () => {
    const app = await setupTest({
      seed: async (seeded) => {
        await save(seeded, {
          logicalDate: todayOf(seeded),
          moodId: "mood-good",
        });
      },
    });

    expect(app.logic.view({ weekEndsOn: 0 }).moodLinks).toMatchObject({
      minDays: 2,
      whatYouDo: [],
      howYouFelt: null,
    });
  });
});

describe("InsightsLogic what changed lately", () => {
  it("should ask for a longer period when the last 90 days or the time before has fewer than 30 days", async () => {
    const app = await setupTest({ seed: saveFiveDays });

    expect(app.logic.view({ weekEndsOn: 0 }).recent).toEqual({
      enough: false,
      items: [],
    });
  });

  it("should list the activities that changed by 10 points or more, the largest change first", async () => {
    const app = await setupTest({
      seed: async (seeded) => {
        const today = todayOf(seeded);
        for (let back = 0; back < 150; back++) {
          const recent = back < 90;
          const gym = recent ? back % 2 === 0 : back % 10 === 0;
          const cook = !recent && back % 3 === 0;
          const reading = back % 20 === 0;
          await save(seeded, {
            logicalDate: addDays(today, -back),
            moodId: !recent ? "mood-meh" : gym ? "mood-good" : "mood-bad",
            activityIds: [
              ...(gym ? ["activity-gym"] : []),
              ...(cook ? ["activity-cook"] : []),
              ...(reading ? ["activity-reading"] : []),
            ],
          });
        }
      },
    });

    const { recent } = app.logic.view({ weekEndsOn: 0 });

    expect(recent.enough).toEqual(true);
    // Reading went from 5% to 6% of days, so it stays out.
    expect(recent.items.map((item) => item.name)).toEqual(["Gym", "Cook"]);
    const [gym, cook] = recent.items;
    expect(gym?.before).toBeCloseTo(0.1);
    expect(gym?.after).toBeCloseTo(0.5);
    expect(gym?.moodDifference).toBeCloseTo(2);
    expect(cook?.before).toBeCloseTo(1 / 3);
    expect(cook?.after).toEqual(0);
    expect(cook?.moodDifference).toEqual(null);
  });

  it("should not compare when the period has no days before the last 90", async () => {
    const app = await setupTest({
      seed: async (seeded) => {
        await saveRun(seeded, {
          endBack: 0,
          count: 150,
          moodId: () => "mood-good",
        });
      },
    });

    app.logic.choosePeriod({ preset: "90d" });

    expect(app.logic.view({ weekEndsOn: 0 }).recent.enough).toEqual(false);
  });
});

async function seedWeekdays(app: FullApplication) {
  const saved = [
    // A Monday, a Saturday, a Sunday and a Monday.
    ["2020-03-02", "mood-rad"],
    ["2020-03-07", "mood-good"],
    ["2020-03-08", "mood-bad"],
    ["2020-03-09", "mood-bad"],
  ] as const;
  for (const [logicalDate, moodId] of saved) {
    await save(app, { logicalDate, moodId });
  }
}

describe("InsightsLogic the good days by weekday", () => {
  it("should give the share of each weekday, in the order of a week that ends on Sunday", async () => {
    const app = await setupTest({ seed: seedWeekdays });

    const { weekdays } = app.logic.view({ weekEndsOn: 0 });

    expect(
      weekdays.map((item) => [
        item.shortName,
        item.share,
        item.days,
        item.best,
      ]),
    ).toEqual([
      ["Mon", 0.5, 2, false],
      ["Tue", null, 0, false],
      ["Wed", null, 0, false],
      ["Thu", null, 0, false],
      ["Fri", null, 0, false],
      ["Sat", 1, 1, true],
      ["Sun", 0, 1, false],
    ]);
  });

  it("should start the week after the day that it ends on", async () => {
    const app = await setupTest({ seed: seedWeekdays });

    const { weekdays } = app.logic.view({ weekEndsOn: 3 });

    expect(weekdays.map((item) => item.name)).toEqual([
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
    ]);
  });

  it("should use only the days of the period", async () => {
    const app = await setupTest({ seed: seedWeekdays });

    app.logic.choosePeriod({ preset: "custom" });
    app.logic.setCustomStart({ value: "2020-03-07" });
    app.logic.setCustomEnd({ value: "2020-03-09" });

    const { weekdays } = app.logic.view({ weekEndsOn: 0 });

    expect(weekdays.find((item) => item.shortName === "Mon")).toMatchObject({
      share: 0,
      days: 1,
      best: false,
    });
    expect(weekdays.find((item) => item.shortName === "Sat")?.best).toEqual(
      true,
    );
  });
});
