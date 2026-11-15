import { describe, expect, it } from "vitest";
import {
  setupLogicTest,
  type LogicTestParams,
} from "../../core/tests/full-application.js";
import { JournalLogic } from "./journal-logic.js";
import { daysAgo, seedCatalog, todayOf } from "./journal-test-helpers.js";

// A whole-day save has no page. The agent of the owner calls it through MCP, so
// these tests call it on the backend, and read the day through the log.

function setupTest(params: LogicTestParams = {}) {
  return setupLogicTest(params, async (app) => {
    await seedCatalog(app);
    return new JournalLogic(app.frontend);
  });
}

describe("JournalLogic showing a day that was saved as a whole", () => {
  it("should complete the goals of the activities, and clear them when the activities change", async () => {
    const app = await setupTest();
    const { backend, logic } = app;
    const date = daysAgo(app, 4);
    await backend.logic.days.saveDay({
      logicalDate: date,
      input: {
        moodId: "mood-good",
        activityIds: ["activity-walk", "activity-gym"],
      },
    });
    await logic.chooseDate({ logicalDate: date });
    expect(logic.state.draft.completedGoalIds).toEqual(["goal-move"]);

    await backend.logic.days.saveDay({
      logicalDate: date,
      input: { moodId: "mood-meh", activityIds: ["activity-sleep"] },
    });
    await logic.chooseDate({ logicalDate: daysAgo(app, 3) });
    await logic.chooseDate({ logicalDate: date });

    expect(logic.state.entry).toMatchObject({
      moodId: "mood-meh",
      activityIds: ["activity-sleep"],
      completedGoalIds: [],
      version: 2,
    });
    expect(
      await backend.db.selectFrom("goalCompletions").selectAll().execute(),
    ).toEqual([]);
  });

  it("should complete a goal with no activity only when the save names it, and bring its activity", async () => {
    const app = await setupTest();
    const { backend, logic } = app;
    const date = daysAgo(app, 4);

    await backend.logic.days.saveDay({
      logicalDate: date,
      input: {
        moodId: "mood-good",
        activityIds: [],
        completedGoalIds: ["goal-read"],
      },
    });
    await logic.chooseDate({ logicalDate: date });

    expect(logic.state.draft).toMatchObject({
      activityIds: ["activity-reading"],
      completedGoalIds: ["goal-read"],
    });
  });

  it("should drop the taps that waited for the save", async () => {
    const app = await setupTest();
    const { backend, logic } = app;
    const date = todayOf(app);
    await logic.toggleMood({ moodId: "mood-rad" });
    await logic.toggleActivity({ activityId: "activity-gym" });

    await backend.logic.days.saveDay({
      logicalDate: date,
      input: {
        moodId: "mood-bad",
        activityIds: ["activity-walk"],
        expectedVersion: 0,
      },
    });
    await logic.chooseDate({ logicalDate: daysAgo(app, 1) });
    await logic.chooseDate({ logicalDate: date });

    expect(logic.state.entry).toMatchObject({
      moodId: "mood-bad",
      activityIds: ["activity-walk"],
      completedGoalIds: [],
    });
    expect(
      await backend.db.selectFrom("dayMoodSelections").selectAll().execute(),
    ).toEqual([]);
    expect(
      await backend.db
        .selectFrom("dayActivitySelections")
        .selectAll()
        .execute(),
    ).toEqual([]);
  });

  it("should refuse a save of a version that is out of date, and change nothing", async () => {
    const app = await setupTest();
    const { backend } = app;
    const logicalDate = daysAgo(app, 2);
    await backend.logic.days.saveDay({
      logicalDate,
      input: { moodId: "mood-bad", activityIds: ["activity-walk"] },
    });

    await expect(
      backend.logic.days.saveDay({
        logicalDate,
        input: { moodId: "mood-rad", activityIds: [], expectedVersion: 0 },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(
      await backend.db
        .selectFrom("entries")
        .select(["moodId", "version"])
        .execute(),
    ).toEqual([{ moodId: "mood-bad", version: 1 }]);
    expect(
      await backend.db
        .selectFrom("entryActivities")
        .select("activityId")
        .execute(),
    ).toEqual([{ activityId: "activity-walk" }]);
  });

  it("should refuse a mood, an activity and a goal that do not exist, and a goal that is archived", async () => {
    const app = await setupTest();
    const { backend } = app;
    const logicalDate = daysAgo(app, 2);
    await backend.db
      .updateTable("goals")
      .set({ archivedAt: "2026-01-01T00:00:00.000Z" })
      .where("id", "=", "goal-read")
      .execute();
    const save = (input: {
      moodId?: string;
      activityIds?: string[];
      completedGoalIds?: string[];
    }) =>
      backend.logic.days.saveDay({
        logicalDate,
        input: { moodId: "mood-good", activityIds: [], ...input },
      });

    await expect(save({ moodId: "mood-nope" })).rejects.toThrow(
      "Choose one of the five moods.",
    );
    await expect(save({ activityIds: ["activity-nope"] })).rejects.toThrow(
      "One activity is no longer available.",
    );
    await expect(save({ completedGoalIds: ["goal-nope"] })).rejects.toThrow(
      "One goal is no longer available.",
    );
    await expect(save({ completedGoalIds: ["goal-read"] })).rejects.toThrow(
      "An archived goal cannot be marked completed.",
    );
    await expect(
      backend.logic.days.saveDay({
        logicalDate: "2026-02-30",
        input: { moodId: "mood-good", activityIds: [] },
      }),
    ).rejects.toThrow("Choose a valid date.");

    expect(
      await backend.db.selectFrom("entries").selectAll().execute(),
    ).toEqual([]);
  });

  it("should accept the day that has started in the zone furthest ahead, and no later day", async () => {
    const app = await setupTest();
    const { backend } = app;
    const now = backend.services.clock.now();
    const furthestAhead = new Date(now + 14 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const dayAfter = new Date(now + 38 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const entry = await backend.logic.days.saveDay({
      logicalDate: furthestAhead,
      input: { moodId: "mood-good", activityIds: [] },
    });

    expect(entry.logicalDate).toEqual(furthestAhead);
    await expect(
      backend.logic.days.saveDay({
        logicalDate: dayAfter,
        input: { moodId: "mood-good", activityIds: [] },
      }),
    ).rejects.toThrow("That day has not started yet.");
  });
});
