import assert from "node:assert/strict";
import test from "node:test";
import { DaylioMemoryStore } from "../lib/daylio.ts";
import { D1DaylioStore, seedDatabase } from "../lib/server-store.ts";
import { createTestDatabase } from "./helpers/d1-database.mjs";

test("concurrent first requests share the canonical seed catalog", async (t) => {
  const database = createTestDatabase();
  t.after(() => database.sqlite.close());
  database.sqlite.exec("DELETE FROM goals; DELETE FROM activities; DELETE FROM activity_groups; DELETE FROM mood_levels;");
  await Promise.all([seedDatabase(database), seedDatabase(database)]);
  const actual = await new D1DaylioStore(database).bootstrap();
  const expected = new DaylioMemoryStore().bootstrap();
  for (const key of ["moods", "groups", "activities", "goals"]) {
    assert.deepEqual(JSON.parse(JSON.stringify(actual[key])), JSON.parse(JSON.stringify(expected[key])));
  }
});

test("an initialized database needs only one seed check and keeps user changes", async (t) => {
  const database = createTestDatabase();
  t.after(() => database.sqlite.close());
  database.sqlite.exec("UPDATE activities SET name = 'My walk' WHERE id = 'activity-walk'");
  await seedDatabase(database);
  assert.equal(database.queries.length, 1);
  assert.equal(database.batches.length, 0);
  assert.equal(database.sqlite.prepare("SELECT name FROM activities WHERE id = 'activity-walk'").get().name, "My walk");
});
