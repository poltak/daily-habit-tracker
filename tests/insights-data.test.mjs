import assert from "node:assert/strict";
import test from "node:test";
import { addDays, DaylioMemoryStore } from "../lib/daylio.ts";
import { D1DaylioStore } from "../lib/server-store.ts";
import { createTestDatabase } from "./helpers/d1-database.mjs";

function findDay(data, logicalDate) {
  return data.days.find((day) => day.logicalDate === logicalDate);
}

for (const kind of ["memory", "D1"]) {
  test(`${kind} insights include the complete effective history`, async (t) => {
    const database = kind === "D1" ? createTestDatabase() : null;
    if (database) t.after(() => database.sqlite.close());
    const store = database ? new D1DaylioStore(database) : new DaylioMemoryStore();
    const baseDate = "2024-01-01";
    const totalDays = 130;
    const deletedDate = addDays(baseDate, 7);

    if (database) {
      const insertEntry = database.sqlite.prepare("INSERT INTO entries (id, logical_date, mood_id, legacy_note) VALUES (?, ?, 'mood-good', ?)");
      const insertActivity = database.sqlite.prepare("INSERT INTO entry_activities (entry_id, activity_id) VALUES (?, 'activity-walk')");
      for (let index = 0; index < totalDays; index += 1) {
        const id = `insights-entry-${index}`;
        const date = addDays(baseDate, index);
        insertEntry.run(id, date, `private note ${index}`);
        insertActivity.run(id);
      }
      database.sqlite.prepare("UPDATE entries SET deleted_at = '2026-01-01T00:00:00.000Z' WHERE logical_date = ?").run(deletedDate);
      database.sqlite.exec("UPDATE activity_groups SET archived_at = '2026-01-01T00:00:00.000Z' WHERE id = 'group-health'");
      database.sqlite.exec("UPDATE activities SET archived_at = '2026-01-01T00:00:00.000Z' WHERE id = 'activity-walk'");
    } else {
      for (let index = 0; index < totalDays; index += 1) {
        store.saveEntry(addDays(baseDate, index), { moodId: "mood-good", activityIds: ["activity-walk"], completedGoalIds: [], legacyNote: `private note ${index}` });
      }
      store.deleteEntry(deletedDate);
      const archivedGroup = store.createGroup("Archived history");
      store.updateGroup(archivedGroup.id, { archived: true });
      store.updateActivity("activity-walk", { archived: true });
    }

    const overrideDate = addDays(baseDate, totalDays + 1);
    await store.saveEntry(overrideDate, { moodId: "mood-meh", activityIds: ["activity-gym", "activity-walk"], completedGoalIds: [] });
    await store.setMoodSelection(overrideDate, "mood-rad");
    await store.setActivitySelection(overrideDate, "activity-walk", false);
    await store.setActivitySelection(overrideDate, "activity-sleep", true);
    await store.setMoodSelection(addDays(overrideDate, 1), "mood-awful");

    const data = await store.getInsightsData();
    assert.equal(data.days.length, totalDays);
    assert.equal(findDay(data, deletedDate), undefined);
    assert.deepEqual(findDay(data, overrideDate), {
      logicalDate: overrideDate,
      moodId: "mood-rad",
      activityIds: ["activity-gym", "activity-sleep"],
    });
    assert.equal(findDay(data, addDays(overrideDate, 1)), undefined, "selection-only dates are not saved entries");
    assert.ok(data.groups.some((group) => group.archived));
    assert.equal(data.activities.find((activity) => activity.id === "activity-walk")?.archived, true);
    assert.ok(data.days.every((day) => !Object.hasOwn(day, "legacyNote")));
    assert.equal(data.days[0].logicalDate, baseDate);
    assert.equal(data.days.at(-1).logicalDate, overrideDate);

    if (database) {
      database.queries.length = 0;
      database.batches.length = 0;
      await store.getInsightsData();
      assert.equal(database.batches.length, 1, "D1 reads use one coherent batch");
      assert.equal(database.queries.length, 6, "catalog, entry, link, and override reads stay bounded");
      assert.ok(database.queries.every(({ query }) => !/legacy_note|goal/i.test(query)));
    }
  });
}
