import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { addDays, buildGoalHistory, startOfWeek, validateSettingsPatch, weekRangeLabel, weekdayOrder } from "../lib/daylio.ts";
import { DaylioMemoryStore } from "../lib/memory-store.ts";
import { D1DaylioStore } from "../lib/server-store.ts";
import { buildBestWeeksAnalysis } from "../lib/insights-rhythms.ts";
import { createTestDatabase } from "./helpers/d1-database.mjs";

test("week boundaries follow the weekday the week ends on", () => {
  const endOfWeek = (date, weekEndsOn) => addDays(startOfWeek(date, weekEndsOn), 6);
  // 2026-10-01 is a Thursday.
  assert.deepEqual([startOfWeek("2026-10-01"), endOfWeek("2026-10-01")], ["2026-09-28", "2026-10-04"], "weeks end on Sunday by default");
  assert.deepEqual([startOfWeek("2026-10-01", 6), endOfWeek("2026-10-01", 6)], ["2026-09-27", "2026-10-03"]);
  assert.deepEqual([startOfWeek("2026-10-01", 4), endOfWeek("2026-10-01", 4)], ["2026-09-25", "2026-10-01"], "the end day closes its own week");
  assert.deepEqual([startOfWeek("2026-10-01", 3), endOfWeek("2026-10-01", 3)], ["2026-10-01", "2026-10-07"]);
  assert.equal(weekRangeLabel(0), "Monday–Sunday");
  assert.equal(weekRangeLabel(6), "Sunday–Saturday");
  assert.deepEqual(weekdayOrder(0), [1, 2, 3, 4, 5, 6, 0]);
  assert.deepEqual(weekdayOrder(6), [0, 1, 2, 3, 4, 5, 6]);
});

test("settings accept only a weekday for the end of the week", () => {
  assert.deepEqual(validateSettingsPatch({ weekEndsOn: 5 }), { weekEndsOn: 5 });
  assert.deepEqual(validateSettingsPatch({}), {});
  for (const value of [7, -1, 1.5, "0", null]) assert.throws(() => validateSettingsPatch({ weekEndsOn: value }), /Choose a weekday/);
  assert.throws(() => validateSettingsPatch({ theme: "dark" }), /Unsupported setting: theme/);
  assert.throws(() => validateSettingsPatch([]), /must be an object/);
});

test("goal weeks move with the setting, and a completion counts in the week that contains it", () => {
  const goal = { id: "goal", activityId: null, name: "Goal", materialIcon: "task_alt", repeatType: "weekly", scheduleType: "times_per_week", targetPerWeek: 2, sortOrder: 0, archived: false, reminderEnabled: false };
  // Saturday 2026-10-03 and Sunday 2026-10-04.
  const weeks = (weekEndsOn) => buildGoalHistory({ goal, startDate: "2026-10-01", endDate: "2026-10-31", completedDates: ["2026-10-03", "2026-10-04"], weekEndsOn, asOf: "2026-10-12" })
    .weeks.slice(0, 2).map((week) => [week.weekStart, week.weekEnd, week.completedCount, week.status]);
  assert.deepEqual(weeks(0), [["2026-09-28", "2026-10-04", 2, "accomplished"], ["2026-10-05", "2026-10-11", 0, "not_accomplished"]]);
  assert.deepEqual(weeks(6), [["2026-09-27", "2026-10-03", 1, "not_accomplished"], ["2026-10-04", "2026-10-10", 1, "not_accomplished"]]);
});

test("insight weeks move with the setting", () => {
  const moods = [{ id: "m4", name: "Good", score: 4, emoji: "", color: "#c" }];
  const day = (logicalDate) => ({ logicalDate, moodId: "m4", activityIds: [] });
  // Sunday 2026-01-04 to Saturday 2026-01-10, every day logged.
  const days = ["04", "05", "06", "07", "08", "09", "10"].map((date) => day(`2026-01-${date}`));
  const analyze = (weekEndsOn) => buildBestWeeksAnalysis({ days, moods, activities: [], startDate: "2026-01-01", endDate: "2026-01-31", asOf: "2026-02-01", weekEndsOn });
  const mondayWeeks = analyze(undefined);
  assert.equal(mondayWeeks.weekRange, "Monday–Sunday");
  assert.deepEqual(mondayWeeks.weeks.map((week) => [week.weekStart, week.loggedDays]), [["2026-01-05", 6]], "the lone Sunday falls in a week with too few logged days");
  assert.match(mondayWeeks.weeks[0].label, /\(Monday–Sunday\)$/);
  const sundayWeeks = analyze(6);
  assert.equal(sundayWeeks.weekRange, "Sunday–Saturday");
  assert.deepEqual(sundayWeeks.weeks.map((week) => [week.weekStart, week.weekEnd, week.loggedDays]), [["2026-01-04", "2026-01-10", 7]]);
  assert.match(sundayWeeks.cohortMethod, /run Sunday–Saturday/);
});

for (const kind of ["memory", "D1"]) {
  test(`${kind} store saves the week setting and uses it for goal history`, async (t) => {
    const database = kind === "D1" ? createTestDatabase() : null;
    if (database) t.after(() => database.sqlite.close());
    const store = database ? new D1DaylioStore(database) : new DaylioMemoryStore();
    assert.deepEqual((await store.bootstrap()).settings, { weekEndsOn: 0 });
    const request = { goalId: "goal-move", startDate: "2026-10-01", endDate: "2026-10-31", asOf: "2026-10-01" };
    assert.equal((await store.getGoalHistory(request)).weeks[0].weekStart, "2026-09-28");

    assert.deepEqual(await store.updateSettings({ weekEndsOn: 6 }), { weekEndsOn: 6 });
    assert.deepEqual((await store.bootstrap()).settings, { weekEndsOn: 6 });
    assert.equal((await store.getGoalHistory(request)).weeks[0].weekStart, "2026-09-27");
    assert.deepEqual(await store.updateSettings({ weekEndsOn: 2 }), { weekEndsOn: 2 });
    await assert.rejects(async () => store.updateSettings({ weekEndsOn: 9 }), /Choose a weekday/);
    assert.deepEqual((await store.bootstrap()).settings, { weekEndsOn: 2 });
    const exported = await store.exportData();
    if (database) assert.deepEqual(exported.tables.app_settings.map((row) => [row.key, row.value]), [["week_ends_on", "2"]]);
    else assert.deepEqual(exported.settings, { weekEndsOn: 2 });
  });
}

test("the week setting has a table, an API route, and a Setup control", async () => {
  const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
  assert.match(await read("../drizzle/0008_app_settings.sql"), /CREATE TABLE `app_settings` \(\s*`key` text PRIMARY KEY NOT NULL/);
  assert.match(await read("../db/schema.ts"), /export const appSettings = sqliteTable\("app_settings"/);
  assert.match(await read("../app/api/settings/route.ts"), /export async function PATCH[\s\S]*store\.updateSettings\(payload\)/);
  const setupSource = await read("../app/components/setup-view.tsx");
  assert.match(setupSource, /fetch\("\/api\/settings", \{\s*method: "PATCH"/);
  assert.match(setupSource, /<span>Week ends on<\/span>/);
  assert.match(setupSource, /value=\{data\.settings\.weekEndsOn\}/);
  const pageSource = await read("../app/journal.tsx");
  assert.match(pageSource, /<InsightsView weekEndsOn=\{data\.settings\.weekEndsOn\} \/>/);
  assert.equal((pageSource.match(/weekEndsOn=\{data\.settings\.weekEndsOn\}/g) ?? []).length, 3, "insights, the calendar, and the goal page all receive it");
  assert.equal((pageSource.match(/\(firstDay - weekStartsOn\(weekEndsOn\) \+ 7\) % 7/g) ?? []).length, 2, "both calendar grids start on the first day of the week");
});
