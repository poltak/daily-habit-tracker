import assert from "node:assert/strict";
import test from "node:test";

const { draftFromDayRefreshState } = await import("../lib/day-refresh.ts");

test("day refresh merges entry and selection state, including a 404 response body", () => {
  const draft = draftFromDayRefreshState({
    entry: null,
    completedGoalIds: ["goal-a", "goal-a"],
    daySelections: {
      logicalDate: "2026-09-21",
      moodId: "mood-good",
      activityIds: ["activity-walk"],
      moodOverride: true,
      activityOverrideIds: ["activity-walk"],
    },
  });

  assert.deepEqual(draft, {
    moodId: "mood-good",
    activityIds: ["activity-walk"],
    completedGoalIds: ["goal-a"],
    localTime: "23:00",
  });
});

test("day refresh keeps the server entry version for a clean draft", () => {
  const draft = draftFromDayRefreshState({
    entry: {
      id: "entry-1",
      logicalDate: "2026-09-21",
      localTime: "21:00",
      timezone: "Asia/Ho_Chi_Minh",
      moodId: "mood-meh",
      activityIds: ["activity-read"],
      completedGoalIds: ["goal-read"],
      version: 7,
      createdAt: "2026-09-21T00:00:00.000Z",
      updatedAt: "2026-09-21T00:01:00.000Z",
    },
  });

  assert.equal(draft.version, 7);
  assert.deepEqual(draft.activityIds, ["activity-read"]);
  assert.deepEqual(draft.completedGoalIds, ["goal-read"]);
});
