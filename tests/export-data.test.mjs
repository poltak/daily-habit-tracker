import assert from "node:assert/strict";
import test from "node:test";
import { DaylioMemoryStore } from "../lib/daylio.ts";
import { D1DaylioStore } from "../lib/server-store.ts";
import { createTestDatabase } from "./helpers/d1-database.mjs";

for (const kind of ["memory", "D1"]) {
  test(`${kind} exports selections and goal completions without a saved entry`, async (t) => {
    const database = kind === "D1" ? createTestDatabase() : null;
    if (database) t.after(() => database.sqlite.close());
    const store = database ? new D1DaylioStore(database) : new DaylioMemoryStore();
    const date = "2026-02-01";
    await store.setMoodSelection(date, "mood-rad");
    await store.setActivitySelection(date, "activity-walk", false);
    await store.setGoalCompletion(date, "goal-move", true);
    if (database) database.batches.length = 0;
    const exported = await store.exportData();
    if (database) {
      assert.deepEqual(database.batches, [10]);
      assert.equal(exported.tables.entries.length, 0);
      assert.equal(exported.tables.goal_completions[0].logical_date, date);
      assert.equal(exported.tables.day_mood_selections[0].mood_id, "mood-rad");
      assert.equal(exported.tables.day_activity_selections[0].selected, 0);
    } else {
      assert.equal(exported.entries.length, 0);
      assert.equal(exported.goalCompletions[0].logicalDate, date);
      assert.equal(exported.dayMoodSelections[0].logicalDate, date);
      assert.equal(exported.dayMoodSelections[0].moodId, "mood-rad");
      assert.equal(exported.dayActivitySelections[0].selected, false);
    }
  });
}
