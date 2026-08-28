import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schemaSource = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
const daylioSource = await readFile(new URL("../lib/daylio.ts", import.meta.url), "utf8");
const serverStoreSource = await readFile(new URL("../lib/server-store.ts", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const migrationSource = await readFile(new URL("../drizzle/0003_stormy_cammi.sql", import.meta.url), "utf8");
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
  assert.equal(
    serverStoreSource.match(/SELECT id FROM goals WHERE activity_id = \? AND archived_at IS NULL ORDER BY id/g)?.length,
    2,
  );
  assert.match(pageSource, /filter\(\(goal\) => !goal\.archived && goal\.activityId === id\)/);
  assert.match(pageSource, /filter\(\(goal\) => !goal\.archived && goal\.activityId === linkedActivityId\)/);
});
