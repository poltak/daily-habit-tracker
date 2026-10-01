import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schemaSource = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
const daylioSource = await readFile(new URL("../lib/memory-store.ts", import.meta.url), "utf8");
const serverStoreSource = await readFile(new URL("../lib/server-store.ts", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../app/journal.tsx", import.meta.url), "utf8");
const migrationSource = await readFile(new URL("../drizzle/0003_stormy_cammi.sql", import.meta.url), "utf8");
const placeholderMigration = await readFile(new URL("../drizzle/0005_unlink_imported_goal_placeholders.sql", import.meta.url), "utf8");
const migrationSnapshot = JSON.parse(await readFile(new URL("../drizzle/meta/0003_snapshot.json", import.meta.url), "utf8"));

test("goals allow a nullable activity link in the schema and migration", () => {
  const goalsSchema = schemaSource.match(/export const goals = sqliteTable\("goals", \{[\s\S]*?\n\}\);/)?.[0] ?? "";
  assert.match(goalsSchema, /activityId: text\("activity_id"\)\.references\(\(\) => activities\.id\)/);
  assert.doesNotMatch(goalsSchema, /activityId: text\("activity_id"\)\.notNull\(\)/);
  assert.match(migrationSource, /CREATE TABLE `goals` \([\s\S]*`activity_id` text,/);
  assert.match(migrationSource, /^PRAGMA defer_foreign_keys=ON;/);
  assert.doesNotMatch(migrationSource, /PRAGMA foreign_keys=OFF/);
  assert.match(migrationSource, /ALTER TABLE `goals` RENAME TO `__old_goals`;/);
  assert.match(migrationSource, /CREATE TABLE `__new_goal_completions` \([\s\S]*FOREIGN KEY \(`goal_id`\) REFERENCES `goals`/);
  assert.match(migrationSource, /INSERT INTO `__new_goal_completions`[\s\S]*FROM `goal_completions`;/);
  assert.match(migrationSource, /DROP TABLE `goal_completions`;[\s\S]*ALTER TABLE `__new_goal_completions` RENAME TO `goal_completions`;/);
  assert.match(migrationSource, /DROP TABLE `__old_goals`;/);
  assert.equal(migrationSnapshot.tables.goals.columns.activity_id.notNull, false);
});

test("memory store keeps linked goal and activity state coupled", () => {
  assert.match(daylioSource, /setGoalCompletion\(logicalDate: string, goalId: string, completed: boolean\): SelectionMutationResult/);
  assert.match(daylioSource, /const affectedGoals = goal\.activityId/);
  assert.match(daylioSource, /storeActivitySelection\(logicalDate, goal\.activityId, completed\)/);
  assert.match(daylioSource, /setActivitySelection\(logicalDate: string, activityId: string, selected: boolean\): SelectionMutationResult/);
  assert.match(daylioSource, /const affectedGoals = \[\.\.\.this\.goals\.values\(\)\]\.filter\(\(goal\) => !goal\.archived && goal\.activityId === activityId\)/);
  assert.match(daylioSource, /activityId: input\.activityId \?\? null/);
  assert.match(daylioSource, /patch\.activityId !== undefined && patch\.activityId !== null/);
});

test("archived linked goals stay out of coupled toggles", () => {
  assert.match(daylioSource, /filter\(\(goal\) => !goal\.archived && goal\.activityId === activityId\)/);
  assert.match(daylioSource, /filter\(\(candidate\) => !candidate\.archived && candidate\.activityId === goal\.activityId\)/);
  assert.match(serverStoreSource, /SELECT id FROM goals WHERE activity_id = \? AND archived_at IS NULL ORDER BY id/);
  assert.match(serverStoreSource, /SELECT id FROM goals WHERE archived_at IS NULL AND activity_id = \(SELECT activity_id FROM goals WHERE id = \?\) ORDER BY id/);
  assert.match(pageSource, /filter\(\(goal\) => !goal\.archived && goal\.activityId === id\)/);
  assert.match(pageSource, /filter\(\(goal\) => !goal\.archived && goal\.activityId === linkedActivityId\)/);
});

for (const kind of ["memory", "D1"]) {
  test(`${kind} toggles skip archived linked goals and reject unknown items`, async (t) => {
    const { DaylioMemoryStore } = await import("../lib/memory-store.ts");
    const { D1DaylioStore } = await import("../lib/server-store.ts");
    const { createTestDatabase } = await import("./helpers/d1-database.mjs");
    const database = kind === "D1" ? createTestDatabase() : null;
    if (database) t.after(() => database.sqlite.close());
    const store = database ? new D1DaylioStore(database) : new DaylioMemoryStore();
    const archivedGoal = await store.createGoal({ name: "Lift", activityId: "activity-gym", startDate: "2026-01-01" });
    await store.updateGoal(archivedGoal.id, { archived: true });
    const soloGoal = await store.createGoal({ name: "Solo", activityId: null, startDate: "2026-01-01" });
    if (database) database.batches.length = 0;

    const byActivity = await store.setActivitySelection("2026-01-02", "activity-gym", true);
    assert.deepEqual(byActivity.affectedGoalCompletions.map((completion) => completion.goalId), ["goal-move"]);
    // One batch of three lookups, then one batch with the selection and the completion.
    if (database) assert.deepEqual(database.batches, [3, 2]);

    const byGoal = await store.setGoalCompletion("2026-01-03", "goal-move", true);
    assert.deepEqual(byGoal.affectedGoalCompletions.map((completion) => completion.goalId), ["goal-move"]);
    assert.deepEqual(byGoal.affectedActivitySelections, [{ logicalDate: "2026-01-03", activityId: "activity-gym", selected: true }]);
    if (database) assert.deepEqual(database.batches.slice(2), [3, 2]);

    const bySoloGoal = await store.setGoalCompletion("2026-01-03", soloGoal.id, true);
    assert.deepEqual(bySoloGoal.affectedGoalCompletions.map((completion) => completion.goalId), [soloGoal.id]);
    assert.equal(bySoloGoal.selection, undefined);
    assert.deepEqual((await store.getGoalCompletionIds("2026-01-03")).sort(), ["goal-move", soloGoal.id].sort());

    await assert.rejects(async () => store.setGoalCompletion("2026-01-03", "goal-missing", true), /no longer available/);
    await assert.rejects(async () => store.setActivitySelection("2026-01-03", "activity-missing", true), /no longer available/);
  });
}

test("the placeholder cleanup migration only unlinks identified imported goal activities", () => {
  assert.match(placeholderMigration, /UPDATE `goals`[\s\S]*SET `activity_id` = NULL/);
  assert.match(placeholderMigration, /source_system` = 'daylio'/);
  assert.match(placeholderMigration, /id` GLOB 'daylio-activity-unlinked-goal-\*'/);
  assert.match(placeholderMigration, /source_id` GLOB '__unlinked_goal_\*__'/);
  assert.match(placeholderMigration, /group_id` = 'daylio-group-unlinked-goals'/);
  assert.doesNotMatch(placeholderMigration, /name`\s*=\s*'Imported goal link'/);
  assert.doesNotMatch(placeholderMigration, /DELETE\s+FROM/);
});
