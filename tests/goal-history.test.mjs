import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const setupSource = await readFile(new URL("../app/components/setup-view.tsx", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

const {
  ALL_WEEKDAYS_MASK,
  DaylioMemoryStore,
  buildGoalHistory,
  normalizeGoalConfig,
} = await import("../lib/daylio.ts");

test("goal configuration normalizes Daily weekdays and Weekly targets", () => {
  assert.deepEqual(normalizeGoalConfig({ repeatType: "daily", weekdaysMask: 0b00111110 }), {
    repeatType: "daily",
    scheduleType: "weekdays",
    targetPerWeek: null,
    weekdaysMask: 0b00111110,
  });
  assert.deepEqual(normalizeGoalConfig({ repeatType: "daily", weekdaysMask: ALL_WEEKDAYS_MASK }), {
    repeatType: "daily",
    scheduleType: "daily",
    targetPerWeek: null,
    weekdaysMask: ALL_WEEKDAYS_MASK,
  });
  assert.deepEqual(normalizeGoalConfig({ repeatType: "weekly", targetPerWeek: 7 }), {
    repeatType: "weekly",
    scheduleType: "times_per_week",
    targetPerWeek: 7,
    weekdaysMask: null,
  });
  assert.throws(() => normalizeGoalConfig({ repeatType: "daily", weekdaysMask: 0 }), /at least one weekday/);
  assert.throws(() => normalizeGoalConfig({ repeatType: "weekly", targetPerWeek: 8 }), /between 1 and 7/);
  assert.throws(() => normalizeGoalConfig({ repeatType: "weekly", targetPerWeek: "3" }), /must be a number/);
  assert.throws(() => normalizeGoalConfig({ repeatType: "daily", weekdaysMask: true }), /must be a number/);
});

test("Daily history excludes unscheduled weekdays from weekly failure", () => {
  const goal = {
    id: "goal-weekdays",
    activityId: null,
    name: "Weekdays",
    materialIcon: "task_alt",
    repeatType: "daily",
    scheduleType: "weekdays",
    weekdaysMask: 0b00111110,
    sortOrder: 0,
    archived: false,
    reminderEnabled: false,
  };
  const history = buildGoalHistory({
    goal,
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    completedDates: ["2026-01-01", "2026-01-02", "2026-01-05", "2026-01-06", "2026-01-07"],
    asOf: "2026-02-01",
  });
  assert.equal(history.days.find((day) => day.logicalDate === "2026-01-03")?.scheduled, false);
  assert.equal(history.days.find((day) => day.logicalDate === "2026-01-03")?.completed, false);
  const firstWeek = history.weeks.find((week) => week.weekStart === "2025-12-28");
  assert.deepEqual(firstWeek && { expected: firstWeek.expectedCount, completed: firstWeek.completedCount, status: firstWeek.status }, { expected: 5, completed: 2, status: "not_accomplished" });
});

test("Weekly history becomes accomplished as soon as the current target is reached", () => {
  const goal = {
    id: "goal-weekly",
    activityId: null,
    name: "Weekly",
    materialIcon: "task_alt",
    repeatType: "weekly",
    scheduleType: "times_per_week",
    targetPerWeek: 3,
    sortOrder: 0,
    archived: false,
    reminderEnabled: false,
  };
  const history = buildGoalHistory({
    goal,
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    completedDates: ["2026-01-01", "2026-01-02", "2026-01-03"],
    asOf: "2026-01-03",
  });
  const firstWeek = history.weeks.find((week) => week.weekStart === "2025-12-28");
  assert.equal(firstWeek?.completedCount, 3);
  assert.equal(firstWeek?.status, "accomplished");
  assert.equal(firstWeek?.accomplished, true);
});

test("Weekly history evaluates only active dates, caps partial weeks, and omits inactive weeks", () => {
  const goal = {
    id: "goal-active-range",
    activityId: null,
    name: "Active range",
    materialIcon: "task_alt",
    repeatType: "weekly",
    scheduleType: "times_per_week",
    targetPerWeek: 5,
    startDate: "2026-01-02",
    endDate: "2026-01-06",
    sortOrder: 0,
    archived: false,
    reminderEnabled: false,
  };
  const completedDates = ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05"];
  const history = buildGoalHistory({ goal, startDate: "2026-01-01", endDate: "2026-01-31", completedDates, asOf: "2026-01-06" });
  assert.deepEqual(history.weeks.map((week) => [week.weekStart, week.expectedCount, week.completedCount]), [
    ["2025-12-28", 2, 2],
    ["2026-01-04", 3, 2],
  ]);
  assert.equal(history.weeks[0]?.status, "accomplished");
  assert.equal(history.weeks[1]?.status, "in_progress");
  assert.equal(history.weeks.some((week) => week.expectedCount === 0), false);

  const beforeStart = buildGoalHistory({ goal, startDate: "2026-01-01", endDate: "2026-01-31", completedDates: [], asOf: "2026-01-01" });
  assert.equal(beforeStart.weeks.every((week) => week.status === "upcoming"), true);
  const afterEnd = buildGoalHistory({ goal, startDate: "2026-01-01", endDate: "2026-01-31", completedDates: [], asOf: "2026-01-07" });
  assert.equal(afterEnd.weeks.every((week) => week.status === "not_accomplished"), true);
});

test("memory store persists goal icon, repeat settings, and history", () => {
  const store = new DaylioMemoryStore();
  const goal = store.createGoal({ name: "Custom goal", activityId: null, repeatType: "daily", weekdaysMask: 1, materialIcon: "favorite" });
  assert.equal(goal.materialIcon, "favorite");
  assert.equal(goal.repeatType, "daily");
  assert.equal(goal.scheduleType, "weekdays");
  const updated = store.updateGoal(goal.id, { repeatType: "weekly", targetPerWeek: 2, materialIcon: "star" });
  assert.equal(updated.materialIcon, "star");
  assert.equal(updated.repeatType, "weekly");
  assert.equal(updated.targetPerWeek, 2);
  const history = store.getGoalHistory({ goalId: goal.id, startDate: "2026-01-01", endDate: "2026-01-31", asOf: "2026-02-01" });
  assert.equal(history.goal.materialIcon, "star");
  assert.equal(history.weeks.every((week) => week.expectedCount === 2), true);
});

test("goal migration adds explicit icon and repeat columns with legacy backfill", async () => {
  const migration = await readFile(new URL("../drizzle/0004_flaky_roxanne_simpson.sql", import.meta.url), "utf8");
  const journal = await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8");
  assert.match(migration, /ALTER TABLE `goals` ADD `material_icon` text DEFAULT 'task_alt' NOT NULL/);
  assert.match(migration, /ALTER TABLE `goals` ADD `repeat_type` text DEFAULT 'daily' NOT NULL/);
  assert.match(migration, /UPDATE `goals` SET `repeat_type` = 'weekly' WHERE `schedule_type` = 'times_per_week';/);
  assert.match(journal, /0004_flaky_roxanne_simpson/);
});

test("goal UI separates completion from detail navigation and exposes repeat controls", () => {
  assert.match(pageSource, /type View = "log" \| "calendar" \| "settings" \| "goal"/);
  assert.match(pageSource, /onOpenGoal=\{openGoal\}/);
  assert.match(pageSource, /pushState\(state/);
  assert.match(pageSource, /addEventListener\("popstate"/);
  assert.match(pageSource, /history\.back\(\)/);
  assert.match(pageSource, /if \(goal\) \{\s*if \(!goalConfigDraft\) setGoalConfigDraft\(goalConfigFromGoal\(goal\)\);\s*\} else \{/);
  assert.match(pageSource, /className="goal-checkbox"/);
  assert.match(pageSource, /className="goal-main" onClick=\{onOpen\}/);
  assert.match(pageSource, /<option value="daily">Daily<\/option>/);
  assert.match(pageSource, /<option value="weekly">Weekly<\/option>/);
  assert.match(pageSource, /<option value="">No associated activity<\/option>/);
  assert.match(pageSource, /activityId: config\.activityId/);
  assert.match(pageSource, /config\.activityId !== goal\.activityId/);
  assert.match(pageSource, /Days expected/);
  assert.match(pageSource, /Every day/);
  assert.match(pageSource, /api\/goals\/\$\{selectedGoalId\}\/history/);
  assert.match(pageSource, /asOf: logicalDateFromDate\(\)/);
  assert.match(pageSource, /disabled=\{isSavingGoalConfig/);
  assert.match(pageSource, /activeGoalConfigSaveRef/);
  assert.match(pageSource, /Wait for the goal update to finish before leaving this goal/);
  assert.match(pageSource, /goal-day \$\{state/);
  assert.doesNotMatch(pageSource, /goal-not-scheduled/);
  assert.match(setupSource, /itemType = "Activity"/);
  assert.match(setupSource, /Configure \$\{goal\.name\}/);
  assert.doesNotMatch(setupSource, /Choose icon for \$\{goal\.name\}/);
  assert.doesNotMatch(setupSource, /Change activity for \$\{goal\.name\}/);
  assert.match(stylesSource, /\.goal-config-card/);
  assert.match(stylesSource, /\.goal-day\.not-completed/);
  assert.doesNotMatch(stylesSource, /goal-not-scheduled/);
});
