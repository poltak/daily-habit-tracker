import assert from "node:assert/strict";
import test from "node:test";

const { filterActivityGroups, summarizeActivityGroup } = await import("../lib/activity-groups.ts");

const groups = [
  { id: "group-b", name: "Later", sortOrder: 2, archived: false },
  { id: "group-archived", name: "Archived", sortOrder: 3, archived: true },
  { id: "group-a", name: "First", sortOrder: 1, archived: false },
  { id: "group-empty", name: "Empty", sortOrder: 4, archived: false },
];

const activities = [
  { id: "read", groupId: "group-b", name: "Read", icon: "menu_book", sortOrder: 2, archived: false },
  { id: "walk", groupId: "group-a", name: "Walk outside", icon: "directions_walk", sortOrder: 2, archived: false },
  { id: "archived-walk", groupId: "group-a", name: "Walk old route", icon: "directions_walk", sortOrder: 1, archived: true },
  { id: "cook", groupId: "group-a", name: "Cook", icon: "soup_kitchen", sortOrder: 3, archived: false },
  { id: "archived-read", groupId: "group-archived", name: "Read old list", icon: "menu_book", sortOrder: 1, archived: true },
];

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

test("activity groups filter case-insensitively and sort groups and activities", () => {
  const result = filterActivityGroups({ groups, activities, query: "WALK" });

  assert.deepEqual(result.map(({ group, activities: matching }) => [group.id, matching.map((activity) => activity.id)]), [
    ["group-a", ["walk"]],
  ]);
});

test("activity groups exclude archived groups and activities by default", () => {
  const result = filterActivityGroups({ groups, activities });

  assert.deepEqual(result.map(({ group, activities: visible }) => [group.id, visible.map((activity) => activity.id)]), [
    ["group-a", ["walk", "cook"]],
    ["group-b", ["read"]],
  ]);
});

test("activity groups can include archived records and omit empty groups", () => {
  const result = filterActivityGroups({ groups, activities, includeArchived: true });

  assert.deepEqual(result.map(({ group, activities: visible }) => [group.id, visible.map((activity) => activity.id)]), [
    ["group-a", ["archived-walk", "walk", "cook"]],
    ["group-b", ["read"]],
    ["group-archived", ["archived-read"]],
  ]);
  assert.equal(result.some(({ group }) => group.id === "group-empty"), false);
});
