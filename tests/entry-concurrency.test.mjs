import assert from "node:assert/strict";
import test from "node:test";
import { DaylioMemoryStore } from "../lib/daylio.ts";
import { entryInputFromDraft } from "../lib/draft-storage.ts";
import { D1DaylioStore } from "../lib/server-store.ts";
import { createTestDatabase } from "./helpers/d1-database.mjs";

const date = "2026-01-01";
const input = { moodId: "mood-good", activityIds: [], completedGoalIds: [] };

test("draft saves use the API version field, including create-only saves", () => {
  assert.deepEqual(entryInputFromDraft({ ...input, localTime: "20:00", version: 4 }), { ...input, localTime: "20:00", expectedVersion: 4 });
  assert.equal(entryInputFromDraft({ ...input, localTime: "20:00" }).expectedVersion, 0);
});

for (const kind of ["memory", "D1"]) {
  test(`${kind} rejects stale saves through deletion and restoration`, async (t) => {
    const database = kind === "D1" ? createTestDatabase() : null;
    if (database) t.after(() => database.sqlite.close());
    const store = database ? new D1DaylioStore(database) : new DaylioMemoryStore();
    const save = (value) => Promise.resolve().then(() => store.saveEntry(date, value));
    const first = await save({ ...input, expectedVersion: 0 });
    assert.equal(first.version, 1);
    await assert.rejects(save({ ...input, expectedVersion: 0 }), { code: "VERSION_CONFLICT" });
    await store.deleteEntry(date, 1);
    await assert.rejects(save({ ...input, expectedVersion: 1 }), { code: "VERSION_CONFLICT" });
    const restored = await save({ ...input, expectedVersion: 0 });
    assert.equal(restored.id, first.id);
    assert.equal(restored.version, 3);
    await assert.rejects(save({ ...input, expectedVersion: 1 }), { code: "VERSION_CONFLICT" });
    const updated = await save({ ...input, moodId: "mood-rad", expectedVersion: 3 });
    assert.equal(updated.moodId, "mood-rad");
    assert.equal(updated.version, 4);
    await assert.rejects(Promise.resolve().then(() => store.deleteEntry(date, 3)), { code: "VERSION_CONFLICT" });
    assert.equal((await store.getEntry(date)).version, 4);
  });
}

test("concurrent D1 saves roll back the losing write and its activity changes", async (t) => {
  const database = createTestDatabase();
  t.after(() => database.sqlite.close());
  const store = new D1DaylioStore(database);
  await store.saveEntry(date, input);
  const attempts = [
    { ...input, activityIds: ["activity-walk"], moodId: "mood-rad", expectedVersion: 1 },
    { ...input, activityIds: ["activity-sleep"], moodId: "mood-meh", expectedVersion: 1 },
  ];
  const results = await Promise.allSettled(attempts.map((candidate) => store.saveEntry(date, candidate)));
  assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(results.find(({ status }) => status === "rejected").reason.code, "VERSION_CONFLICT");
  const winner = attempts[results.findIndex(({ status }) => status === "fulfilled")];
  const entry = await store.getEntry(date);
  assert.equal(entry.version, 2);
  assert.equal(entry.moodId, winner.moodId);
  assert.deepEqual(entry.activityIds, winner.activityIds);
});

test("a D1 save consumes selection changes in the same transaction", async (t) => {
  const database = createTestDatabase();
  t.after(() => database.sqlite.close());
  const store = new D1DaylioStore(database);
  await store.saveEntry(date, input);
  database.setBeforeBatch(async () => {
    await store.setMoodSelection(date, "mood-rad");
    await store.setActivitySelection(date, "activity-gym", true);
  });
  const entry = await store.saveEntry(date, { ...input, expectedVersion: 1 });
  assert.equal(entry.moodId, "mood-rad");
  assert.deepEqual(entry.activityIds, ["activity-gym"]);
  assert.deepEqual(entry.completedGoalIds, ["goal-move"]);
  assert.equal((await store.getDaySelections(date)).moodOverride, false);
});
