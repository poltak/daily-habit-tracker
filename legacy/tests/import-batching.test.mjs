import assert from "node:assert/strict";
import test from "node:test";
import { addDays } from "../lib/daylio.ts";
import { D1DaylioStore } from "../lib/server-store.ts";
import { createTestDatabase } from "./helpers/d1-database.mjs";
import { importPayload } from "./helpers/import-payload.mjs";

test("history imports batch entries with their complete activity sets", async () => {
  const database = createTestDatabase();
  const store = new D1DaylioStore(database);
  const payload = importPayload();
  const entry = payload.entries[0];
  payload.entries = Array.from({ length: 100 }, (_, index) => ({
    ...entry,
    sourceId: `e-${index}`,
    logicalDate: addDays("2020-01-01", index),
    activitySourceIds: ["a", "a"],
  }));
  payload.completions = [];
  await store.importData(payload);
  assert.equal(database.sqlite.prepare("SELECT COUNT(*) AS count FROM entries").get().count, 100);
  assert.equal(database.sqlite.prepare("SELECT COUNT(*) AS count FROM entry_activities").get().count, 100);
  // Seven entry transactions replace 100 round trips. Each entry and its links
  // remain in one transaction, and no import batch exceeds 50 statements.
  assert.equal(database.batches.filter((size) => size === 48).length, 6);
  assert.equal(database.batches.filter((size) => size === 12).length, 1);
  assert.ok(database.batches.length <= 10);
  assert.ok(database.batches.every((size) => size <= 50));
  database.sqlite.close();
});
