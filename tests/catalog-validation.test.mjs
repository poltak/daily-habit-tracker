import assert from "node:assert/strict";
import test from "node:test";
import { DaylioMemoryStore } from "../lib/daylio.ts";
import { D1DaylioStore } from "../lib/server-store.ts";
import { readJson } from "../lib/api.ts";
import { createTestDatabase } from "./helpers/d1-database.mjs";

for (const kind of ["memory", "D1"]) {
  test(`${kind} rejects invalid catalog values without changing records`, async (t) => {
    const database = kind === "D1" ? createTestDatabase() : null;
    if (database) t.after(() => database.sqlite.close());
    const store = database ? new D1DaylioStore(database) : new DaylioMemoryStore();
    const before = await store.bootstrap();
    for (const patch of [null, [], { id: "replacement" }, { archived: "false" }, { sortOrder: "next" }, { sortOrder: NaN }, { name: 42 }]) {
      await assert.rejects(Promise.resolve().then(() => store.updateGroup("group-health", patch)));
    }
    await assert.rejects(Promise.resolve().then(() => store.updateActivity("activity-walk", { groupId: "missing" })), /Choose an activity group/);
    await assert.rejects(Promise.resolve().then(() => store.updateGoal("goal-read", { reminderEnabled: "false" })), /must be a boolean/);
    await assert.rejects(Promise.resolve().then(() => store.updateGoal("goal-read", { reminderTime: "25:00" })), /valid reminder time/);
    const after = await store.bootstrap();
    assert.deepEqual(after.groups, before.groups);
    assert.deepEqual(after.activities, before.activities);
    assert.deepEqual(after.goals, before.goals);
    assert.equal((await store.updateGroup("group-health", { archived: true })).archived, true);
    assert.equal((await store.updateGroup("group-health", { archived: false })).archived, false);
  });
}

test("JSON routes reject non-object bodies and require the exact media type", async () => {
  for (const body of [null, [], true, "text", 42]) {
    await assert.rejects(readJson(new Request("https://example.test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })), /body must be an object/);
  }
  await assert.rejects(readJson(new Request("https://example.test", { method: "POST", headers: { "content-type": "application/json-invalid" }, body: "{}" })), /Expected a JSON request/);
  assert.deepEqual(await readJson(new Request("https://example.test", { method: "POST", headers: { "content-type": "Application/JSON; charset=utf-8" }, body: "{}" })), {});
});
