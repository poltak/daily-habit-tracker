import assert from "node:assert/strict";
import test from "node:test";
import { DaylioMemoryStore } from "../lib/daylio.ts";
import { D1DaylioStore } from "../lib/server-store.ts";
import { createTestDatabase } from "./helpers/d1-database.mjs";
import { importPayload } from "./helpers/import-payload.mjs";

for (const kind of ["memory", "D1"]) {
  test(`${kind} preserves imported archive state and applies changed settings on repeat imports`, async (t) => {
    const database = kind === "D1" ? createTestDatabase() : null;
    if (database) t.after(() => database.sqlite.close());
    const store = database ? new D1DaylioStore(database) : new DaylioMemoryStore();
    const payload = importPayload();
    payload.moods[0].name = "Custom good mood";
    let state = await store.importData(payload);
    assert.equal(state.moods.length, 5);
    assert.equal(state.groups.find(({ id }) => id === "daylio-group-g").archived, true);
    assert.equal(state.activities.find(({ id }) => id === "daylio-activity-a").archived, true);
    assert.equal(state.goals.find(({ id }) => id === "daylio-goal-goal").archived, true);
    payload.groups[0].archived = false;
    payload.activities[0].archived = false;
    payload.activities[0].sourceIconId = "favorite";
    Object.assign(payload.goals[0], { archived: false, sortOrder: 8, reminderEnabled: false, reminderTime: "21:00" });
    payload.entries[0].legacyNote = "Updated import note";
    state = await store.importData(payload);
    assert.equal(state.groups.filter(({ id }) => id === "daylio-group-g").length, 1);
    assert.equal(state.groups.find(({ id }) => id === "daylio-group-g").archived, false);
    const activity = state.activities.find(({ id }) => id === "daylio-activity-a");
    assert.equal(activity.archived, false);
    assert.equal(activity.sourceIconId, "favorite");
    const goal = state.goals.find(({ id }) => id === "daylio-goal-goal");
    assert.equal(goal.archived, false);
    assert.equal(goal.sortOrder, 8);
    assert.equal(goal.reminderEnabled, false);
    assert.equal(goal.reminderTime, "21:00");
    const entry = await store.getEntry("2020-01-01");
    assert.equal(entry.version, 2);
    assert.equal(entry.legacyNote, "Updated import note");
    await assert.rejects(Promise.resolve().then(() => store.saveEntry(entry.logicalDate, { ...entry, expectedVersion: 1 })), { code: "VERSION_CONFLICT" });
  });
}
