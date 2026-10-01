import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DaylioMemoryStore, buildGoalHistory, logicalDateFromDate } from "../lib/daylio.ts";
import { D1DaylioStore, GOAL_START_DATE_BACKFILL } from "../lib/server-store.ts";
import { createTestDatabase } from "./helpers/d1-database.mjs";
import { importPayload } from "./helpers/import-payload.mjs";

const weeklyGoal = { id: "goal", activityId: null, name: "Goal", materialIcon: "task_alt", repeatType: "weekly", scheduleType: "times_per_week", targetPerWeek: 3, sortOrder: 0, archived: false, reminderEnabled: false };

test("weeks before a goal's start date are not judged", () => {
  const history = buildGoalHistory({ goal: { ...weeklyGoal, startDate: "2026-09-17" }, startDate: "2026-09-01", endDate: "2026-09-30", completedDates: [], weekEndsOn: 0, asOf: "2026-10-01" });
  assert.deepEqual(history.weeks.map((week) => [week.weekStart, week.expectedCount]), [["2026-09-14", 3], ["2026-09-21", 3], ["2026-09-28", 3]]);
  assert.equal(history.days.find((day) => day.logicalDate === "2026-09-16")?.scheduled, false);
  assert.equal(history.days.find((day) => day.logicalDate === "2026-09-17")?.scheduled, true);
});

test("a completion before the start date moves the judged start back to it", () => {
  const goal = { ...weeklyGoal, repeatType: "daily", scheduleType: "daily", targetPerWeek: null, weekdaysMask: 127, startDate: "2026-10-02" };
  const range = { startDate: "2026-10-01", endDate: "2026-10-31", weekEndsOn: 0, asOf: "2026-10-02" };
  const withoutEarlier = buildGoalHistory({ goal, completedDates: ["2026-10-02"], firstCompletedDate: "2026-10-02", ...range });
  assert.deepEqual([withoutEarlier.weeks[0].completedCount, withoutEarlier.weeks[0].expectedCount], [1, 3]);
  const tickedYesterday = buildGoalHistory({ goal, completedDates: ["2026-10-01", "2026-10-02"], firstCompletedDate: "2026-10-01", ...range });
  assert.deepEqual([tickedYesterday.weeks[0].completedCount, tickedYesterday.weeks[0].expectedCount], [2, 4]);
  assert.equal(tickedYesterday.goal.startDate, "2026-10-02", "the stored start date is returned unchanged");
});

for (const kind of ["memory", "D1"]) {
  test(`${kind} goals start on the device date sent at creation`, async (t) => {
    const database = kind === "D1" ? createTestDatabase() : null;
    if (database) t.after(() => database.sqlite.close());
    const store = database ? new D1DaylioStore(database) : new DaylioMemoryStore();
    const sent = await store.createGoal({ name: "Stretch", activityId: null, repeatType: "weekly", targetPerWeek: 2, startDate: "2026-10-01" });
    assert.equal(sent.startDate, "2026-10-01");
    const fallback = await store.createGoal({ name: "Read", activityId: null, repeatType: "weekly", targetPerWeek: 2 });
    assert.equal(fallback.startDate, logicalDateFromDate());
    await assert.rejects(async () => store.createGoal({ name: "Bad", activityId: null, startDate: "2026-13-01" }), /valid goal start date/);
    await assert.rejects(async () => store.updateGoal(sent.id, { startDate: "2020-01-01" }), /Unsupported goal field: startDate/);

    // Ticking the day before the start date still counts toward that week.
    await store.setGoalCompletion("2026-09-30", sent.id, true);
    const history = await store.getGoalHistory({ goalId: sent.id, startDate: "2026-10-01", endDate: "2026-10-31", asOf: "2026-10-01" });
    assert.deepEqual([history.weeks[0].weekStart, history.weeks[0].completedCount], ["2026-09-28", 1]);
    const september = await store.getGoalHistory({ goalId: sent.id, startDate: "2026-09-01", endDate: "2026-09-30", asOf: "2026-10-01" });
    assert.deepEqual(september.weeks.map((week) => week.weekStart), ["2026-09-28"]);
  });

  test(`${kind} imported goals start on their first completion`, async (t) => {
    const database = kind === "D1" ? createTestDatabase() : null;
    if (database) t.after(() => database.sqlite.close());
    const store = database ? new D1DaylioStore(database) : new DaylioMemoryStore();
    const payload = importPayload();
    const goalSourceId = payload.goals[0].sourceId;
    const firstCompletion = payload.completions.filter((completion) => completion.goalSourceId === goalSourceId).map((completion) => completion.logicalDate).sort()[0];
    const imported = await store.importData(payload);
    assert.ok(firstCompletion, "the fixture completes its first goal");
    assert.equal(imported.goals.find((goal) => goal.id === `daylio-goal-${goalSourceId}`)?.startDate, firstCompletion);
  });
}

test("the migration gives existing goals a start date from their first completion", async (t) => {
  const migration = await readFile(new URL("../drizzle/0009_backfill_goal_start_dates.sql", import.meta.url), "utf8");
  assert.ok(migration.includes(`${GOAL_START_DATE_BACKFILL};`), "the import and the migration use the same statement");

  const database = createTestDatabase();
  t.after(() => database.sqlite.close());
  const { sqlite } = database;
  sqlite.prepare("UPDATE goals SET created_at = '2026-03-04 05:06:07'").run();
  sqlite.prepare("INSERT INTO goal_completions (id, goal_id, logical_date) VALUES ('c1', 'goal-move', '2025-06-10'), ('c2', 'goal-move', '2025-06-03')").run();
  sqlite.prepare("INSERT INTO goals (id, name, schedule_type, sort_order, start_date) VALUES ('goal-kept', 'Kept', 'daily', 9, '2024-01-01')").run();
  sqlite.exec(migration);
  const startDates = Object.fromEntries(sqlite.prepare("SELECT id, start_date FROM goals").all().map((row) => [row.id, row.start_date]));
  assert.equal(startDates["goal-move"], "2025-06-03", "first completion");
  assert.equal(startDates["goal-read"], "2026-03-04", "creation date when never completed");
  assert.equal(startDates["goal-kept"], "2024-01-01", "an existing start date is kept");
});
