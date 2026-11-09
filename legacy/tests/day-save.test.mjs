import assert from "node:assert/strict";
import test from "node:test";
import { planDaySave } from "../lib/daylio.ts";
import { DaylioMemoryStore } from "../lib/memory-store.ts";
import { D1DaylioStore } from "../lib/server-store.ts";
import { createTestDatabase } from "./helpers/d1-database.mjs";

// Seed catalog: goal-move is linked to activity-gym, goal-read to activity-reading.
const sorted = (values) => [...values].sort();

test("a day's goal completions follow its activities, and a completed linked goal selects its activity", () => {
  const goals = [
    { id: "linked", activityId: "gym", archived: false },
    { id: "solo", activityId: null, archived: false },
    { id: "old", activityId: "gym", archived: true },
  ];
  assert.deepEqual(planDaySave({ goals, activityIds: ["gym", "walk"] }), { activityIds: ["gym", "walk"], completeGoalIds: ["linked"], clearGoalIds: [] });
  assert.deepEqual(planDaySave({ goals, activityIds: ["walk"] }), { activityIds: ["walk"], completeGoalIds: [], clearGoalIds: ["linked"] });
  assert.deepEqual(planDaySave({ goals, activityIds: [], completedGoalIds: ["linked", "solo"] }), { activityIds: ["gym"], completeGoalIds: ["linked", "solo"], clearGoalIds: [] });
  assert.deepEqual(planDaySave({ goals, activityIds: [], completedGoalIds: [] }), { activityIds: [], completeGoalIds: [], clearGoalIds: ["linked", "solo"] });
  assert.throws(() => planDaySave({ goals, activityIds: [], completedGoalIds: ["old"] }), /archived goal/);
  assert.throws(() => planDaySave({ goals, activityIds: [], completedGoalIds: ["missing"] }), /no longer available/);
});

for (const kind of ["memory", "D1"]) {
  const setup = (t) => {
    const database = kind === "D1" ? createTestDatabase() : null;
    if (database) t.after(() => database.sqlite.close());
    return { database, store: database ? new D1DaylioStore(database) : new DaylioMemoryStore() };
  };

  test(`${kind} saveDay writes the mood, exactly the given activities, and the coupled goals`, async (t) => {
    const { database, store } = setup(t);
    const solo = await store.createGoal({ name: "Stretch", activityId: null, startDate: "2026-01-01" });
    if (database) { database.queries.length = 0; database.batches.length = 0; }

    const created = await store.saveDay("2026-01-05", { moodId: "mood-good", activityIds: ["activity-walk", "activity-gym"], completedGoalIds: [solo.id] });
    assert.equal(created.moodId, "mood-good");
    assert.equal(created.version, 1);
    assert.deepEqual(sorted(created.activityIds), ["activity-gym", "activity-walk"]);
    assert.deepEqual(sorted(created.completedGoalIds), sorted(["goal-move", solo.id]));
    if (database) {
      // One write transaction, and few enough queries for the free D1 limit of 50 per request.
      assert.deepEqual(database.batches.filter((size) => size === 10), [10]);
      assert.ok(database.queries.length <= 20, `${database.queries.length} queries`);
    }

    // Replacing the day drops Gym, so its linked goal is cleared. The unlinked goal is left alone.
    const replaced = await store.saveDay("2026-01-05", { moodId: "mood-meh", activityIds: ["activity-sleep"] });
    assert.equal(replaced.moodId, "mood-meh");
    assert.equal(replaced.version, 2);
    assert.deepEqual(replaced.activityIds, ["activity-sleep"]);
    assert.deepEqual(replaced.completedGoalIds, [solo.id]);

    // An explicit empty list clears the unlinked goal. A completed linked goal brings its activity.
    const explicit = await store.saveDay("2026-01-05", { moodId: "mood-meh", activityIds: ["activity-sleep"], completedGoalIds: ["goal-read"] });
    assert.deepEqual(sorted(explicit.activityIds), ["activity-reading", "activity-sleep"]);
    assert.deepEqual(explicit.completedGoalIds, ["goal-read"]);
  });

  test(`${kind} saveDay discards pending taps and respects the expected version`, async (t) => {
    const { store } = setup(t);
    const date = "2026-01-06";
    await store.setMoodSelection(date, "mood-rad");
    await store.setActivitySelection(date, "activity-gym", true);
    const saved = await store.saveDay(date, { moodId: "mood-bad", activityIds: ["activity-walk"], expectedVersion: 0 });
    assert.equal(saved.moodId, "mood-bad");
    assert.deepEqual(saved.activityIds, ["activity-walk"]);
    assert.deepEqual(saved.completedGoalIds, [], "Gym was not saved, so its goal is cleared");
    const selections = await store.getDaySelections(date);
    assert.equal(selections.moodOverride, false);
    assert.deepEqual(selections.activityOverrideIds, []);

    // expectedVersion 0 means "only if no entry exists yet".
    await assert.rejects(async () => store.saveDay(date, { moodId: "mood-rad", activityIds: ["activity-gym"], expectedVersion: 0 }), (error) => error.code === "VERSION_CONFLICT");
    const unchanged = await store.getEntry(date);
    assert.equal(unchanged.moodId, "mood-bad");
    assert.deepEqual(unchanged.activityIds, ["activity-walk"]);
    assert.deepEqual(unchanged.completedGoalIds, []);
    assert.equal((await store.saveDay(date, { moodId: "mood-rad", activityIds: [], expectedVersion: 1 })).version, 2);
  });

  test(`${kind} saveDay rejects unknown references before writing`, async (t) => {
    const { store } = setup(t);
    const date = "2026-01-07";
    await assert.rejects(async () => store.saveDay(date, { moodId: "mood-nope", activityIds: [] }), /five moods/);
    await assert.rejects(async () => store.saveDay(date, { moodId: "mood-good", activityIds: ["activity-nope"] }), /activity is no longer available/);
    await assert.rejects(async () => store.saveDay(date, { moodId: "mood-good", activityIds: [], completedGoalIds: ["goal-nope"] }), /goal is no longer available/);
    await assert.rejects(async () => store.saveDay(date, { moodId: "mood-good", activityIds: [], note: "hi" }), /Unsupported day field: note/);
    await assert.rejects(async () => store.saveDay("2026-02-30", { moodId: "mood-good", activityIds: [] }), /valid date/);
    assert.equal(await store.getEntry(date), null);
    assert.deepEqual(await store.getGoalCompletionIds(date), []);
  });

  test(`${kind} lists entries in a date range oldest first and reports the history span`, async (t) => {
    const { store } = setup(t);
    assert.deepEqual(await store.getHistorySpan(), { firstDate: null, lastDate: null, recordedDays: 0 });
    for (const [date, moodId] of [["2026-03-10", "mood-good"], ["2026-01-02", "mood-bad"], ["2026-02-14", "mood-rad"]]) {
      await store.saveDay(date, { moodId, activityIds: ["activity-walk"] });
    }
    await store.saveDay("2026-02-20", { moodId: "mood-meh", activityIds: [] });
    await store.deleteEntry("2026-02-20");
    await store.setMoodSelection("2026-02-14", "mood-awful");

    const range = await store.listEntriesInRange("2026-01-02", "2026-02-28");
    assert.deepEqual(range.map((entry) => [entry.logicalDate, entry.moodId]), [["2026-01-02", "mood-bad"], ["2026-02-14", "mood-awful"]]);
    assert.deepEqual(range[0].activityIds, ["activity-walk"]);
    assert.deepEqual(await store.getHistorySpan(), { firstDate: "2026-01-02", lastDate: "2026-03-10", recordedDays: 3 });
    await assert.rejects(async () => store.listEntriesInRange("2026-03-01", "2026-01-01"), /valid date range/);
  });
}
