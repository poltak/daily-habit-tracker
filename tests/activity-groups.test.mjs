import assert from "node:assert/strict";
import test from "node:test";

const { summarizeActivityGroup } = await import("../lib/activity-groups.ts");

test("activity group summaries count visible and selected activities", () => {
  assert.deepEqual(
    summarizeActivityGroup({ activityIds: ["walk", "read", "cook"], selectedActivityIds: ["read", "missing"] }),
    { activityCount: 3, selectedCount: 1 },
  );
});

test("activity group summaries support an empty selection", () => {
  assert.deepEqual(
    summarizeActivityGroup({ activityIds: [], selectedActivityIds: ["read"] }),
    { activityCount: 0, selectedCount: 0 },
  );
});
