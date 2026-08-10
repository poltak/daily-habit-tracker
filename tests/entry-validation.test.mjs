import assert from "node:assert/strict";
import test from "node:test";

const { validateEntryInput, validateEntryReferences } = await import("../lib/entry-validation.ts");

test("entry saves reject malformed payloads with clear errors", () => {
  assert.throws(
    () => validateEntryInput(null),
    { message: "Entry payload must be an object." },
  );
  assert.throws(
    () => validateEntryInput({ moodId: "mood-good", activityIds: [], completedGoalIds: [], localTime: "25:00" }),
    { message: "Choose a valid entry time." },
  );
});

test("entry saves reject unknown references with clear errors", () => {
  const references = {
    moodIds: new Set(["mood-good"]),
    activityIds: new Set(["activity-archived"]),
    goalIds: new Set(["goal-read"]),
  };
  const input = { moodId: "mood-good", activityIds: ["activity-archived"], completedGoalIds: [], localTime: "20:00" };

  assert.throws(
    () => validateEntryReferences({ ...input, moodId: "mood-missing" }, references),
    { message: "Choose one of the five moods." },
  );
  assert.throws(
    () => validateEntryReferences({ ...input, activityIds: ["activity-missing"] }, references),
    { message: "One activity is no longer available." },
  );
  assert.throws(
    () => validateEntryReferences({ ...input, completedGoalIds: ["goal-missing"] }, references),
    { message: "One goal is no longer available." },
  );
  assert.deepEqual(validateEntryReferences(input, references), input);
});
