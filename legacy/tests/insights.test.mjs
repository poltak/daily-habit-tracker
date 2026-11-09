import assert from "node:assert/strict";
import test from "node:test";
import { daysInInsightsRange, insightsDateRange, summarizeMood } from "../lib/insights.ts";
import { MOODS } from "../lib/daylio.ts";

test("mood summaries exclude unknown moods and preserve an empty sample", () => {
  const summary = summarizeMood([
    { logicalDate: "2026-01-01", moodId: "mood-rad", activityIds: [] },
    { logicalDate: "2026-01-02", moodId: "mood-meh", activityIds: [] },
    { logicalDate: "2026-01-03", moodId: "unknown", activityIds: [] },
  ], MOODS);
  assert.equal(summary.count, 2);
  assert.equal(summary.mean, 4);
  assert.equal(summary.goodRate, 0.5);
  assert.equal(summary.distribution.reduce((sum, mood) => sum + mood.count, 0), 2);
  assert.equal(summarizeMood([], MOODS).mean, null);
  assert.equal(summarizeMood([], MOODS).goodRate, null);
});

test("insight windows include exact calendar days across leap years and DST", () => {
  const quarter = insightsDateRange("90d", "2024-03-31", "2020-01-01");
  assert.deepEqual(quarter, { startDate: "2024-01-02", endDate: "2024-03-31" });
  assert.equal(daysInInsightsRange(quarter.startDate, quarter.endDate), 90);
  const year = insightsDateRange("1y", "2024-03-31", "2020-01-01");
  assert.equal(daysInInsightsRange(year.startDate, year.endDate), 365);
  assert.equal(daysInInsightsRange("2024-02-28", "2024-03-01"), 3);
  assert.equal(daysInInsightsRange("2026-09-19", "2026-09-19"), 1);
});

test("calendar-year and all-time ranges do not extend into the future", () => {
  assert.deepEqual(insightsDateRange("2026", "2026-09-19", "2020-01-01"), { startDate: "2026-01-01", endDate: "2026-09-19" });
  assert.deepEqual(insightsDateRange("2024", "2026-09-19", "2020-01-01"), { startDate: "2024-01-01", endDate: "2024-12-31" });
  assert.deepEqual(insightsDateRange("all", "2026-09-19", "2020-02-29"), { startDate: "2020-02-29", endDate: "2026-09-19" });
});
