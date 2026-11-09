import assert from "node:assert/strict";
import test from "node:test";
import { DaylioMemoryStore } from "../lib/memory-store.ts";
import { D1DaylioStore } from "../lib/server-store.ts";
import { createTestDatabase } from "./helpers/d1-database.mjs";

const { deleteWarning } = await import("../lib/catalog-mutations.ts");

for (const kind of ["memory", "D1"]) {
  function createStore(t) {
    const database = kind === "D1" ? createTestDatabase() : null;
    if (database) t.after(() => database.sqlite.close());
    return database ? new D1DaylioStore(database) : new DaylioMemoryStore();
  }

  test(`${kind} deletes a goal with its completions and keeps the saved day`, async (t) => {
    const store = createStore(t);
    const date = "2026-01-05";
    await store.setGoalCompletion(date, "goal-read", true);
    await store.setGoalCompletion(date, "goal-move", true);
    await store.saveEntry(date, { moodId: "mood-good", activityIds: [], completedGoalIds: [] });

    await store.deleteGoal("goal-read");

    assert.deepEqual((await store.bootstrap()).goals.map((goal) => goal.id), ["goal-move"]);
    assert.deepEqual(await store.getGoalCompletionIds(date), ["goal-move"]);
    const entry = await store.getEntry(date);
    assert.deepEqual([...entry.activityIds].sort(), ["activity-gym", "activity-reading"]);
    assert.deepEqual(entry.completedGoalIds, ["goal-move"]);
    await assert.rejects(Promise.resolve().then(() => store.getGoalHistory({ goalId: "goal-read", startDate: date, endDate: date, asOf: date })), /Goal not found/);
    await assert.rejects(Promise.resolve().then(() => store.setGoalCompletion(date, "goal-read", true)), /no longer available/);
    await assert.rejects(Promise.resolve().then(() => store.deleteGoal("goal-read")), /Goal not found/);
  });

  test(`${kind} deletes an activity from each day and keeps a goal that was linked to it`, async (t) => {
    const store = createStore(t);
    const date = "2026-01-05";
    const selectionOnlyDate = "2026-01-06";
    await store.saveEntry(date, { moodId: "mood-good", activityIds: ["activity-gym", "activity-walk"], completedGoalIds: [] });
    await store.setGoalCompletion(date, "goal-move", true);
    await store.setActivitySelection(selectionOnlyDate, "activity-gym", true);

    await store.deleteActivity("activity-gym");

    const after = await store.bootstrap();
    assert.equal(after.activities.some((activity) => activity.id === "activity-gym"), false);
    assert.equal(after.activities.length, 11);
    assert.equal(after.goals.find((goal) => goal.id === "goal-move").activityId, null);
    assert.deepEqual((await store.getEntry(date)).activityIds, ["activity-walk"]);
    assert.deepEqual((await store.getDaySelections(selectionOnlyDate)).activityIds, []);
    assert.deepEqual(await store.getGoalCompletionIds(date), ["goal-move"], "the goal keeps its completions");
    assert.deepEqual(await store.getGoalCompletionIds(selectionOnlyDate), ["goal-move"]);
    const unlinkedToggle = await store.setGoalCompletion(date, "goal-move", false);
    assert.equal(unlinkedToggle.selection, undefined);
    await assert.rejects(Promise.resolve().then(() => store.setActivitySelection(date, "activity-gym", true)), /no longer available/);
    await assert.rejects(Promise.resolve().then(() => store.saveEntry("2026-01-07", { moodId: "mood-good", activityIds: ["activity-gym"], completedGoalIds: [] })), /no longer available/);
    await assert.rejects(Promise.resolve().then(() => store.deleteActivity("activity-gym")), /Activity not found/);
  });

  test(`${kind} deletes a group together with its activities`, async (t) => {
    const store = createStore(t);
    const date = "2026-01-05";
    await store.saveEntry(date, { moodId: "mood-good", activityIds: ["activity-gym", "activity-reading"], completedGoalIds: [] });
    await store.updateActivity("activity-sleep", { archived: true });

    await store.deleteGroup("group-health");

    const after = await store.bootstrap();
    assert.deepEqual(after.groups.map((group) => group.id), ["group-work", "group-home", "group-people", "group-leisure"]);
    assert.equal(after.activities.length, 9, "the archived activity of the group is deleted too");
    assert.equal(after.activities.some((activity) => activity.groupId === "group-health"), false);
    assert.equal(after.goals.find((goal) => goal.id === "goal-move").activityId, null);
    assert.equal(after.goals.find((goal) => goal.id === "goal-read").activityId, "activity-reading");
    assert.deepEqual((await store.getEntry(date)).activityIds, ["activity-reading"]);
    await assert.rejects(Promise.resolve().then(() => store.deleteGroup("group-health")), /Group not found/);

    const empty = await store.createGroup("Temporary");
    await store.deleteGroup(empty.id);
    assert.equal((await store.bootstrap()).groups.some((group) => group.id === empty.id), false);
  });
}

test("the delete alert says that the item cannot be recovered", () => {
  const goalWarning = deleteWarning({ kind: "goal", name: "Read" });
  assert.match(goalWarning, /Delete the goal “Read”\?/);
  assert.match(goalWarning, /completion history/);
  assert.match(goalWarning, /cannot recover/);
  const activityWarning = deleteWarning({ kind: "activity", name: "Gym" });
  assert.match(activityWarning, /Delete the activity “Gym”\?/);
  assert.match(activityWarning, /removes it from each day/);
  assert.match(activityWarning, /cannot recover/);
  const groupWarning = deleteWarning({ kind: "group", name: "Health", activityCount: 3 });
  assert.match(groupWarning, /Delete the activity group “Health”\?/);
  assert.match(groupWarning, /also deletes its 3 activities and removes them from each day on which they are recorded/);
  assert.match(groupWarning, /cannot recover/);
  assert.match(deleteWarning({ kind: "group", name: "Health", activityCount: 1 }), /also deletes its 1 activity and removes it from each day on which it is recorded/);
  const emptyGroupWarning = deleteWarning({ kind: "group", name: "Empty" });
  assert.doesNotMatch(emptyGroupWarning, /activities|activity and/);
  assert.match(emptyGroupWarning, /cannot recover/);
});
