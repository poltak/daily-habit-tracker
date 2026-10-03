import assert from "node:assert/strict";
import test from "node:test";
import { latestStartedDate, requireStartedDate } from "../lib/daylio.ts";
import { DaylioMemoryStore } from "../lib/memory-store.ts";
import { D1DaylioStore } from "../lib/server-store.ts";
import { handleMcpMessage } from "../lib/mcp/server.ts";
import { createTestDatabase } from "./helpers/d1-database.mjs";

const NOT_STARTED = /That day has not started yet/;
const at = (iso) => new Date(iso);

test("the latest started date follows the time zone furthest ahead of UTC", () => {
  assert.equal(latestStartedDate(at("2026-10-03T09:59:59Z")), "2026-10-03");
  assert.equal(latestStartedDate(at("2026-10-03T10:00:00Z")), "2026-10-04", "UTC+14 starts the next day at 10:00 UTC");
  assert.equal(latestStartedDate(at("2026-12-31T23:30:00Z")), "2027-01-01");
});

test("a date check refuses dates that are not real and days that have not started", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: at("2026-10-03T09:59:00Z") });
  assert.throws(() => requireStartedDate("2026-02-30"), /Choose a valid date/);
  assert.throws(() => requireStartedDate("2026-10-04"), NOT_STARTED);
  assert.doesNotThrow(() => requireStartedDate("2026-10-03"));
  assert.doesNotThrow(() => requireStartedDate("2020-01-01"));
});

for (const kind of ["memory", "D1"]) {
  test(`${kind} store refuses records for a day that has not started`, async (t) => {
    const database = kind === "D1" ? createTestDatabase() : null;
    if (database) t.after(() => database.sqlite.close());
    const store = database ? new D1DaylioStore(database) : new DaylioMemoryStore();
    const entry = { moodId: "mood-good", activityIds: [], completedGoalIds: [] };
    const day = { moodId: "mood-good", activityIds: [] };

    // No time zone has reached 4 October yet.
    t.mock.timers.enable({ apis: ["Date"], now: at("2026-10-03T09:59:00Z") });
    await assert.rejects(async () => store.saveEntry("2026-10-04", entry), NOT_STARTED);
    await assert.rejects(async () => store.saveDay("2026-10-04", day), NOT_STARTED);
    await assert.rejects(async () => store.setMoodSelection("2026-10-04", "mood-good"), NOT_STARTED);
    await assert.rejects(async () => store.setActivitySelection("2026-10-04", "activity-gym", true), NOT_STARTED);
    await assert.rejects(async () => store.setGoalCompletion("2026-10-04", "goal-move", true), NOT_STARTED);
    const untouched = await store.getEntryState("2026-10-04");
    assert.equal(untouched.entry, null);
    assert.equal(untouched.daySelections.moodId, null);
    assert.deepEqual(untouched.daySelections.activityIds, []);
    assert.deepEqual(untouched.completedGoalIds, []);
    assert.equal((await store.saveEntry("2026-10-03", entry)).logicalDate, "2026-10-03");

    // One minute later the day starts at UTC+14, so an owner ahead of the server clock can log it.
    t.mock.timers.setTime(at("2026-10-03T10:00:00Z").getTime());
    await store.setMoodSelection("2026-10-04", "mood-rad");
    await store.setGoalCompletion("2026-10-04", "goal-move", true);
    const saved = await store.saveDay("2026-10-04", day);
    assert.equal(saved.logicalDate, "2026-10-04");

    // An entry that is already saved for a later day can still be read and deleted.
    t.mock.timers.setTime(at("2026-09-01T00:00:00Z").getTime());
    await assert.rejects(async () => store.saveDay("2026-10-04", { ...day, moodId: "mood-bad" }), NOT_STARTED);
    assert.equal((await store.getEntryState("2026-10-04")).entry.moodId, "mood-good");
    await store.deleteEntry("2026-10-04", saved.version);
    assert.equal((await store.getEntryState("2026-10-04")).entry, null);
  });
}

test("the MCP save_day tool reports a day that has not started", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: at("2026-10-03T09:59:00Z") });
  const store = new DaylioMemoryStore();
  const call = (date) => handleMcpMessage({
    message: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "save_day", arguments: { date, mood: "Good", activities: [] } } },
    getStore: () => store,
  });
  const refused = (await call("2026-10-04")).result;
  assert.equal(refused.isError, true);
  assert.match(refused.content[0].text, NOT_STARTED);
  assert.equal(store.getEntry("2026-10-04"), null);
  const accepted = (await call("2026-10-03")).result;
  assert.equal(Boolean(accepted.isError), false, accepted.content[0].text);
});
