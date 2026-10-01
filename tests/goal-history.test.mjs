import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/journal.tsx", import.meta.url), "utf8");
const setupSource = await readFile(new URL("../app/components/setup-view.tsx", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

const {
  ALL_WEEKDAYS_MASK,
  buildGoalHistory,
  normalizeGoalConfig,
} = await import("../lib/daylio.ts");
const { DaylioMemoryStore } = await import("../lib/memory-store.ts");

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
    weekEndsOn: 6,
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
    weekEndsOn: 6,
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
  const history = buildGoalHistory({ goal, startDate: "2026-01-01", endDate: "2026-01-31", completedDates, weekEndsOn: 6, asOf: "2026-01-06" });
  assert.deepEqual(history.weeks.map((week) => [week.weekStart, week.expectedCount, week.completedCount]), [
    ["2025-12-28", 2, 2],
    ["2026-01-04", 3, 2],
  ]);
  assert.equal(history.weeks[0]?.status, "accomplished");
  assert.equal(history.weeks[1]?.status, "in_progress");
  assert.equal(history.weeks.some((week) => week.expectedCount === 0), false);

  const beforeStart = buildGoalHistory({ goal, startDate: "2026-01-01", endDate: "2026-01-31", completedDates: [], weekEndsOn: 6, asOf: "2026-01-01" });
  assert.equal(beforeStart.weeks.every((week) => week.status === "upcoming"), true);
  const afterEnd = buildGoalHistory({ goal, startDate: "2026-01-01", endDate: "2026-01-31", completedDates: [], weekEndsOn: 6, asOf: "2026-01-07" });
  assert.equal(afterEnd.weeks.every((week) => week.status === "not_accomplished"), true);
});

test("the current week is in progress before a Daily goal's first scheduled weekday", () => {
  const goal = {
    id: "goal-saturday",
    activityId: null,
    name: "Saturday only",
    materialIcon: "task_alt",
    repeatType: "daily",
    scheduleType: "weekdays",
    weekdaysMask: 0b1000000,
    sortOrder: 0,
    archived: false,
    reminderEnabled: false,
  };
  // 2026-10-01 is a Thursday in the week of Sunday 2026-09-27 to Saturday 2026-10-03.
  const statuses = (asOf, completedDates = []) => buildGoalHistory({ goal, startDate: "2026-10-01", endDate: "2026-10-31", completedDates, weekEndsOn: 6, asOf })
    .weeks.slice(0, 2).map((week) => [week.weekStart, week.status]);
  assert.deepEqual(statuses("2026-10-01"), [["2026-09-27", "in_progress"], ["2026-10-04", "upcoming"]]);
  assert.deepEqual(statuses("2026-10-03"), [["2026-09-27", "in_progress"], ["2026-10-04", "upcoming"]]);
  assert.deepEqual(statuses("2026-10-03", ["2026-10-03"]), [["2026-09-27", "accomplished"], ["2026-10-04", "upcoming"]]);
  assert.deepEqual(statuses("2026-10-04"), [["2026-09-27", "not_accomplished"], ["2026-10-04", "in_progress"]]);
});

test("week status follows where today falls: past weeks are final and later weeks are upcoming", () => {
  const base = { id: "goal", activityId: null, name: "Goal", materialIcon: "task_alt", sortOrder: 0, archived: false, reminderEnabled: false };
  const goals = [
    { ...base, repeatType: "weekly", scheduleType: "times_per_week", targetPerWeek: 3 },
    { ...base, repeatType: "daily", scheduleType: "daily", weekdaysMask: ALL_WEEKDAYS_MASK },
    { ...base, repeatType: "daily", scheduleType: "weekdays", weekdaysMask: 0b0101010 },
    { ...base, repeatType: "daily", scheduleType: "weekdays", weekdaysMask: 0b1000000 },
  ];
  for (const goal of goals) {
    for (let day = 20; day <= 30; day += 1) {
      const asOf = `2026-09-${day}`;
      for (const [startDate, endDate] of [["2026-09-01", "2026-09-30"], ["2026-10-01", "2026-10-31"]]) {
        for (const week of buildGoalHistory({ goal, startDate, endDate, completedDates: [], asOf }).weeks) {
          const context = `${goal.repeatType} mask ${goal.weekdaysMask} week ${week.weekStart} as of ${asOf}`;
          if (week.weekEnd < asOf) assert.equal(week.status, "not_accomplished", context);
          else if (week.weekStart > asOf) assert.equal(week.status, "upcoming", context);
          else assert.notEqual(week.status, "upcoming", context);
        }
      }
    }
  }
});

test("a week becomes not accomplished as soon as its target is out of reach", () => {
  const base = { id: "goal", activityId: null, name: "Goal", materialIcon: "task_alt", sortOrder: 0, archived: false, reminderEnabled: false };
  // The week of Monday 2026-09-28 to Sunday 2026-10-04.
  const status = ({ goal, asOf, completedDates }) => buildGoalHistory({ goal, startDate: "2026-10-01", endDate: "2026-10-31", completedDates, asOf }).weeks[0].status;

  const everyDay = { ...base, repeatType: "daily", scheduleType: "daily", weekdaysMask: ALL_WEEKDAYS_MASK };
  assert.equal(status({ goal: everyDay, asOf: "2026-09-30", completedDates: ["2026-09-28", "2026-09-29"] }), "in_progress");
  assert.equal(status({ goal: everyDay, asOf: "2026-09-30", completedDates: ["2026-09-28"] }), "not_accomplished", "Tuesday was missed");

  const weekly = { ...base, repeatType: "weekly", scheduleType: "times_per_week", targetPerWeek: 3 };
  assert.equal(status({ goal: weekly, asOf: "2026-10-02", completedDates: [] }), "in_progress", "Friday, Saturday, and Sunday are still open");
  assert.equal(status({ goal: weekly, asOf: "2026-10-03", completedDates: [] }), "not_accomplished", "only two days are left");
  assert.equal(status({ goal: weekly, asOf: "2026-10-03", completedDates: ["2026-09-29"] }), "in_progress");
  assert.equal(status({ goal: weekly, asOf: "2026-10-04", completedDates: ["2026-09-29", "2026-10-04"] }), "not_accomplished", "today is done and no day is left");
  assert.equal(status({ goal: weekly, asOf: "2026-10-04", completedDates: ["2026-09-29", "2026-10-03"] }), "in_progress", "today can still be the third day");
});

test("goal detail reloads on a new local day and hides another month's results", () => {
  assert.match(pageSource, /const localToday = data\?\.today;/);
  assert.match(pageSource, /\[goalHistoryMonth, goalHistoryRevision, localToday, selectedGoalId, view\]/);
  assert.match(pageSource, /const monthHistory = history\?\.month === resolvedMonth \? history : null;/);
  assert.match(pageSource, /monthHistory\?\.weeks\.map/);
  assert.doesNotMatch(pageSource, /history\?\.weeks\.map\(|history\?\.days \?\?/);
});

test("memory store persists goal icon, repeat settings, and history", () => {
  const store = new DaylioMemoryStore();
  const goal = store.createGoal({ name: "Custom goal", activityId: null, repeatType: "daily", weekdaysMask: 1, materialIcon: "favorite", startDate: "2026-01-01" });
  assert.equal(goal.materialIcon, "favorite");
  assert.equal(goal.repeatType, "daily");
  assert.equal(goal.scheduleType, "weekdays");
  const updated = store.updateGoal(goal.id, { repeatType: "weekly", targetPerWeek: 2, materialIcon: "star" });
  assert.equal(updated.materialIcon, "star");
  assert.equal(updated.repeatType, "weekly");
  assert.equal(updated.targetPerWeek, 2);
  const history = store.getGoalHistory({ goalId: goal.id, startDate: "2026-01-01", endDate: "2026-01-31", asOf: "2026-02-01" });
  assert.equal(history.goal.materialIcon, "star");
  assert.equal(history.weeks.length, 5);
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
  assert.match(pageSource, /const navLocked = isSavingGoalConfig/);
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
