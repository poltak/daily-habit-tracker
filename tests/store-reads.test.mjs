import assert from "node:assert/strict";
import test from "node:test";
import { addDays, DaylioMemoryStore } from "../lib/daylio.ts";
import { D1DaylioStore } from "../lib/server-store.ts";
import { createTestDatabase } from "./helpers/d1-database.mjs";

for (const kind of ["memory", "D1"]) {
  test(`${kind} entry lists use current selections and standalone completions`, async (t) => {
    const database = kind === "D1" ? createTestDatabase() : null;
    if (database) t.after(() => database.sqlite.close());
    const store = database ? new D1DaylioStore(database) : new DaylioMemoryStore();
    const date = "2026-01-01";
    await store.saveEntry(date, { moodId: "mood-good", activityIds: ["activity-walk"], completedGoalIds: [] });
    await store.setMoodSelection(date, "mood-rad");
    await store.setActivitySelection(date, "activity-walk", false);
    await store.setGoalCompletion(date, "goal-move", true);
    // Imported and standalone completions can have no entry_id.
    if (database) database.sqlite.exec("UPDATE goal_completions SET entry_id = NULL");
    const expected = await store.getEntry(date);
    assert.deepEqual((await store.listEntries())[0], expected);
    assert.deepEqual((await store.bootstrap()).entries[0], expected);
    assert.equal(expected.moodId, "mood-rad");
    assert.deepEqual(expected.activityIds, ["activity-gym"]);
    assert.deepEqual(expected.completedGoalIds, ["goal-move"]);
  });
}

test("entry page reads stay bounded as history grows and do not load the catalog", async (t) => {
  const database = createTestDatabase();
  t.after(() => database.sqlite.close());
  const store = new D1DaylioStore(database);
  const insert = database.sqlite.prepare("INSERT INTO entries (id, logical_date, mood_id) VALUES (?, ?, 'mood-good')");
  for (let i = 0; i < 1200; i += 1) {
    const id = `entry-${i}`;
    const date = addDays("2020-01-01", i);
    insert.run(id, date);
    database.sqlite.prepare("INSERT INTO entry_activities VALUES (?, 'activity-walk')").run(id);
    database.sqlite.prepare("INSERT INTO goal_completions (id, goal_id, logical_date) VALUES (?, 'goal-read', ?)").run(`completion-${i}`, date);
  }
  const entries = await store.listEntries(30, 100);
  assert.equal(entries.length, 30);
  assert.equal(entries[0].logicalDate, addDays("2020-01-01", 1099));
  assert.equal(database.queries.length, 4);
  assert.ok(database.queries.every((query) => query.rows <= 30));
  assert.ok(database.queries.every((query) => !/FROM (activities|goals|activity_groups|mood_levels)\b/.test(query.query)));
  assert.ok(entries.every((entry) => entry.activityIds.length === 1 && entry.completedGoalIds.length === 1));
  const completionQuery = database.queries.find(({ query }) => query.includes("JOIN goal_completions"));
  const plan = database.sqlite.prepare(`EXPLAIN QUERY PLAN ${completionQuery.query}`).all(...completionQuery.values);
  assert.ok(plan.some(({ detail }) => detail.includes("goal_completions_date_goal_idx")));
  assert.ok(plan.every(({ detail }) => !detail.includes("SCAN completion")));
});

test("a date response reads its state once, including dates without entries", async (t) => {
  const database = createTestDatabase();
  t.after(() => database.sqlite.close());
  const store = new D1DaylioStore(database);
  await store.setGoalCompletion("2026-01-01", "goal-move", true);
  database.queries.length = 0;
  const state = await store.getEntryState("2026-01-01");
  assert.equal(state.entry, null);
  assert.deepEqual(state.completedGoalIds, ["goal-move"]);
  assert.deepEqual(state.daySelections.activityIds, ["activity-gym"]);
  assert.equal(database.queries.length, 5);
});

test("entry reference validation batches large selections within D1 binding limits", async (t) => {
  const database = createTestDatabase();
  t.after(() => database.sqlite.close());
  const store = new D1DaylioStore(database);
  const ids = Array.from({ length: 205 }, (_, i) => `activity-test-${i}`);
  for (const id of ids) database.sqlite.prepare("INSERT INTO activities (id, group_id, name, sort_order) VALUES (?, 'group-health', ?, 0)").run(id, id);
  const input = { moodId: "mood-good", activityIds: [...ids, ...ids], completedGoalIds: [] };
  const entry = await store.saveEntry("2026-01-01", input);
  assert.equal(entry.activityIds.length, 205);
  const lookups = database.queries.filter(({ query }) => query.startsWith("SELECT id FROM activities"));
  assert.equal(lookups.length, 3);
  assert.ok(database.queries.every(({ values }) => values.length <= 100));
  await assert.rejects(store.saveEntry("2026-01-02", { ...input, activityIds: [...ids, "missing"] }), /One activity is no longer available/);
  assert.equal(await store.getEntry("2026-01-02"), null);
});
