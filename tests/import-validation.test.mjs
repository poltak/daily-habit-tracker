import assert from "node:assert/strict";
import test from "node:test";
import { DaylioMemoryStore } from "../lib/daylio.ts";
import { D1DaylioStore } from "../lib/server-store.ts";
import { validateImportPayload } from "../lib/import-validation.ts";
import { createTestDatabase } from "./helpers/d1-database.mjs";
import { importPayload } from "./helpers/import-payload.mjs";

test("normalized imports accept nullable Python fields and reject malformed records", () => {
  assert.doesNotThrow(() => validateImportPayload(importPayload()));
  for (const change of [
    (payload) => { payload.entries = null; },
    (payload) => { payload.entries[0].logicalDate = "2026-02-30"; },
    (payload) => { payload.entries.push({ ...payload.entries[0], sourceId: "other" }); },
    (payload) => { payload.activities.push({ ...payload.activities[0] }); },
    (payload) => { payload.groups[0].sortOrder = "first"; },
  ]) {
    const payload = importPayload();
    change(payload);
    assert.throws(() => validateImportPayload(payload));
  }
});

for (const kind of ["memory", "D1"]) {
  test(`${kind} validates the complete import before changing data`, async (t) => {
    const database = kind === "D1" ? createTestDatabase() : null;
    if (database) t.after(() => database.sqlite.close());
    const store = database ? new D1DaylioStore(database) : new DaylioMemoryStore();
    const before = await store.bootstrap();
    const payload = importPayload();
    payload.completions[0].goalSourceId = "missing";
    await assert.rejects(Promise.resolve().then(() => store.importData(payload)), /unknown record/);
    assert.deepEqual(await store.bootstrap(), before);
    if (database) assert.equal(database.sqlite.prepare("SELECT COUNT(*) AS count FROM import_runs").get().count, 0);
    await store.saveEntry("2020-01-01", { moodId: "mood-rad", activityIds: [], completedGoalIds: [] });
    const existing = await store.getEntry("2020-01-01");
    await assert.rejects(Promise.resolve().then(() => store.importData(importPayload())), /different source/);
    assert.deepEqual(await store.getEntry("2020-01-01"), existing);
  });
}
