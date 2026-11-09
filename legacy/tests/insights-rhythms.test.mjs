import assert from "node:assert/strict";
import test from "node:test";

const { buildBestWeeksAnalysis, summarizeRhythms } = await import("../lib/insights-rhythms.ts");

const moods = [
  { id: "m1", name: "Lowest", score: 1, emoji: "", color: "#a" },
  { id: "m3", name: "Okay", score: 3, emoji: "", color: "#b" },
  { id: "m4", name: "Good", score: 4, emoji: "", color: "#c" },
  { id: "m5", name: "Best", score: 5, emoji: "", color: "#d" },
];

const activities = [
  { id: "walk", groupId: "g", name: "Walk", icon: "directions_walk", sortOrder: 0, archived: false },
  { id: "read", groupId: "g", name: "Read", icon: "menu_book", sortOrder: 1, archived: false },
];

function day(logicalDate, moodId, activityIds = []) {
  return { logicalDate, moodId, activityIds };
}

test("rhythm buckets retain logged sample sizes and null mood summaries", () => {
  const result = summarizeRhythms({
    days: [
      day("2026-01-05", "m5", ["walk"]),
      day("2026-01-06", "", ["walk"]),
      day("2026-01-12", "m3"),
      day("2026-02-01", "m1"),
    ],
    moods,
    startDate: "2026-01-01",
    endDate: "2026-02-28",
    activityId: "walk",
  });

  assert.deepEqual(result.yearOptions, [2026]);
  assert.deepEqual(result.weekdays[0] && {
    logged: result.weekdays[0].loggedCount,
    moodCount: result.weekdays[0].count,
    mean: result.weekdays[0].mean,
    fraction: result.weekdays[0].activityFrequency?.fraction,
  }, { logged: 2, moodCount: 2, mean: 4, fraction: 0.5 });
  assert.deepEqual(result.weekdays[1] && {
    logged: result.weekdays[1].loggedCount,
    moodCount: result.weekdays[1].count,
    mean: result.weekdays[1].mean,
  }, { logged: 1, moodCount: 0, mean: null });
  assert.equal(result.months[0]?.loggedCount, 3);
  assert.equal(result.months[0]?.count, 2);
  assert.equal(result.months[1]?.loggedCount, 1);
});

test("best-week cohorts use full ended Monday-Sunday weeks and keep tied boundary weeks together", () => {
  const days = [
    day("2026-01-05", "m5", ["walk"]), day("2026-01-06", "m5", ["walk"]), day("2026-01-07", "m5"), day("2026-01-08", "m5"),
    day("2026-01-12", "m3", ["read"]), day("2026-01-13", "m3"), day("2026-01-14", "m3", ["read"]), day("2026-01-15", "m3"),
    day("2026-01-19", "m3", ["read"]), day("2026-01-20", "m3"), day("2026-01-21", "m3", ["read"]), day("2026-01-22", "m3"),
    day("2026-01-26", "m4"), day("2026-01-27", "m4"), day("2026-01-28", "m4"),
  ];
  const result = buildBestWeeksAnalysis({
    days,
    moods,
    activities,
    startDate: "2026-01-05",
    endDate: "2026-02-01",
    asOf: "2026-02-02",
  });

  assert.equal(result.qualifyingWeekCount, 3);
  assert.deepEqual(result.higherWeeks.map((week) => week.weekStart), ["2026-01-05"]);
  assert.deepEqual(result.typicalWeeks.map((week) => week.weekStart), ["2026-01-12", "2026-01-19"]);
  assert.equal(result.weeks.find((week) => week.weekStart === "2026-01-26"), undefined);
  assert.equal(result.higher.activitySpreadMean, 0.5);
  assert.equal(result.typical.activitySpreadMean, 0.5);
  assert.equal(result.activityComparisons.find((row) => row.activityId === "walk")?.higherFrequency, 0.5);
  assert.equal(result.activityComparisons.find((row) => row.activityId === "read")?.typicalFrequency, 0.5);
});

test("a week ending on as-of is still in progress and equal moods have no invented higher cohort", () => {
  const days = [
    day("2026-01-05", "m4"), day("2026-01-06", "m4"), day("2026-01-07", "m4"), day("2026-01-08", "m4"),
    day("2026-01-12", "m4"), day("2026-01-13", "m4"), day("2026-01-14", "m4"), day("2026-01-15", "m4"),
  ];
  const result = buildBestWeeksAnalysis({ days, moods, activities, startDate: "2026-01-05", endDate: "2026-01-18", asOf: "2026-01-18" });
  assert.equal(result.qualifyingWeekCount, 1);
  assert.equal(result.higher.weekCount, 0);
  assert.equal(result.typical.weekCount, 1);

  const allEqual = buildBestWeeksAnalysis({ days, moods, activities, startDate: "2026-01-05", endDate: "2026-01-18", asOf: "2026-01-19" });
  assert.equal(allEqual.qualifyingWeekCount, 2);
  assert.equal(allEqual.higher.weekCount, 0);
  assert.equal(allEqual.typical.weekCount, 2);
  assert.equal(allEqual.moodThreshold, null);
});
