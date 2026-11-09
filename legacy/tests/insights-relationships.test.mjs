import assert from "node:assert/strict";
import test from "node:test";

const {
  compareActivityCalendarDays,
  compareActivityMood,
  filterRelationshipDays,
  rankActivityMoodAssociations,
  rankActivityPairs,
  compareActivityPair,
} = await import("../lib/insights-relationships.ts");

const moods = [
  { id: "great", name: "Great", score: 5, emoji: "😄", color: "#0a0" },
  { id: "good", name: "Good", score: 4, emoji: "🙂", color: "#8a8" },
  { id: "low", name: "Low", score: 2, emoji: "🙁", color: "#a00" },
];

test("activity associations keep missing and unknown moods out of samples", () => {
  const days = [
    { logicalDate: "2026-01-01", moodId: "great", activityIds: ["walk"] },
    { logicalDate: "2026-01-02", moodId: "low", activityIds: [] },
    { logicalDate: "2026-01-03", moodId: "missing", activityIds: ["walk"] },
  ];
  const association = compareActivityMood({ days, moods, activityId: "walk" });
  assert.equal(association.recorded.sampleSize, 1);
  assert.equal(association.notRecorded.sampleSize, 1);
  assert.equal(association.recorded.mean, 5);
  assert.equal(association.notRecorded.mean, 2);
  assert.equal(association.recorded.goodRate, 1);
  assert.equal(association.notRecorded.goodRate, 0);
  assert.deepEqual(rankActivityMoodAssociations({ days, moods, activities: [{ id: "walk" }] })[0], association);
});

test("year and weekday filters use logical calendar dates", () => {
  const days = [
    { logicalDate: "2025-12-29", moodId: "good", activityIds: [] },
    { logicalDate: "2026-01-05", moodId: "good", activityIds: [] },
    { logicalDate: "2026-01-06", moodId: "good", activityIds: [] },
  ];
  assert.deepEqual(filterRelationshipDays(days, { year: 2026, weekday: 1 }).map((day) => day.logicalDate), ["2026-01-05"]);
});

test("calendar windows use exact dates and omit missing days", () => {
  const days = [
    { logicalDate: "2026-01-01", moodId: "great", activityIds: ["anchor"] },
    { logicalDate: "2026-01-02", moodId: "good", activityIds: [] },
    // 2026-01-03 is intentionally missing. The next available row is not a substitute.
    { logicalDate: "2026-01-04", moodId: "low", activityIds: [] },
  ];
  const result = compareActivityCalendarDays({ days, moods, activityId: "anchor" });
  assert.deepEqual(result.offsets.map((offset) => offset.recordedDates), [[], ["2026-01-01"], ["2026-01-02"], []]);
  assert.equal(result.offsets[3].recorded.sampleSize, 0);
  assert.equal(result.offsets[3].notRecorded.sampleSize, 1);
});

test("pair suggestions require all four cohorts, while sparse pairs remain explorable", () => {
  const days = [];
  for (let index = 0; index < 2; index += 1) {
    days.push({ logicalDate: `2026-02-${String(index + 1).padStart(2, "0")}`, moodId: "great", activityIds: ["a"] });
    days.push({ logicalDate: `2026-02-${String(index + 3).padStart(2, "0")}`, moodId: "good", activityIds: ["b"] });
    days.push({ logicalDate: `2026-02-${String(index + 5).padStart(2, "0")}`, moodId: "low", activityIds: ["a", "b"] });
    days.push({ logicalDate: `2026-02-${String(index + 7).padStart(2, "0")}`, moodId: "good", activityIds: [] });
  }
  const pairs = rankActivityPairs({ days, moods, activities: [{ id: "a" }, { id: "b" }], minObservations: 2 });
  assert.equal(pairs.comparisons.length, 1);
  assert.equal(pairs.suggestions.length, 1);
  assert.deepEqual(pairs.suggestions[0].sampleSizes, { neither: 2, aOnly: 2, bOnly: 2, both: 2 });
  const manual = compareActivityPair({ days: days.slice(0, 3), moods, activityAId: "a", activityBId: "b", minObservations: 2 });
  assert.equal(manual.adequate, false);
  assert.ok(manual.sparseGroups.includes("neither"));
});
