import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";

test.describe("catalog changes", () => {
  test("should create a group, an activity and a goal with the JSON that the pages read", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const group = await ownerRequest.post(`${apiOrigin}/api/catalog`, {
      data: { kind: "group", name: "  Travel " },
    });
    expect(group.status()).toBe(201);
    const { group: created } = await group.json();
    expect(created).toMatchObject({ name: "Travel", archived: false });

    const activity = await ownerRequest.post(`${apiOrigin}/api/catalog`, {
      data: { kind: "activity", name: "Test reading", groupId: created.id },
    });
    expect(activity.status()).toBe(201);
    expect((await activity.json()).activity).toMatchObject({
      name: "Test reading",
      groupId: created.id,
      icon: "menu_book",
      archived: false,
    });

    const goal = await ownerRequest.post(`${apiOrigin}/api/catalog`, {
      data: { kind: "goal", name: "   ", scheduleType: "daily" },
    });
    expect(goal.status()).toBe(201);
    expect((await goal.json()).goal).toMatchObject({
      name: "Activity goal",
      activityId: null,
      repeatType: "daily",
      scheduleType: "daily",
      archived: false,
    });
  });

  for (const [name, data] of [
    ["a group with no name", { kind: "group", name: "   " }],
    ["a group with a name that is not text", { kind: "group", name: 5 }],
    ["an item of a kind that does not exist", { kind: "mood", name: "Sad" }],
    [
      "an activity in a group that does not exist",
      { kind: "activity", name: "Yoga", groupId: "group-missing" },
    ],
    [
      "an activity with no name",
      { kind: "activity", name: " ", groupId: "group-health" },
    ],
    [
      "a goal for an activity that does not exist",
      { kind: "goal", name: "Run", activityId: "activity-missing" },
    ],
    [
      "a goal with a repeat that does not exist",
      { kind: "goal", name: "Run", repeatType: "monthly" },
    ],
    [
      "a weekly goal with more than seven days",
      { kind: "goal", name: "Run", repeatType: "weekly", targetPerWeek: 8 },
    ],
    [
      "a daily goal with no weekday",
      { kind: "goal", name: "Run", weekdaysMask: 0 },
    ],
    [
      "a goal with a start date that is not a date",
      { kind: "goal", name: "Run", startDate: "tomorrow" },
    ],
  ] as const) {
    test(`should refuse ${name}`, async ({ ownerRequest, apiOrigin }) => {
      const response = await ownerRequest.post(`${apiOrigin}/api/catalog`, {
        data,
      });

      expect(response.status()).toBe(400);
    });
  }

  test("should change an item and answer with it", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const group = await ownerRequest.patch(
      `${apiOrigin}/api/catalog/group/group-work`,
      { data: { name: " Job ", archived: true } },
    );
    expect(group.status()).toBe(200);
    expect((await group.json()).group).toMatchObject({
      id: "group-work",
      name: "Job",
      archived: true,
    });

    const activity = await ownerRequest.patch(
      `${apiOrigin}/api/catalog/activity/activity-gym`,
      { data: { name: "Running", icon: "category", groupId: "group-home" } },
    );
    expect(activity.status()).toBe(200);
    expect((await activity.json()).activity).toMatchObject({
      name: "Running",
      groupId: "group-home",
      icon: "fitness_center",
    });

    const goal = await ownerRequest.patch(
      `${apiOrigin}/api/catalog/goal/goal-read`,
      {
        data: {
          repeatType: "daily",
          weekdaysMask: 0b0111110,
          materialIcon: "star",
          activityId: null,
        },
      },
    );
    expect(goal.status()).toBe(200);
    expect((await goal.json()).goal).toMatchObject({
      scheduleType: "weekdays",
      weekdaysMask: 0b0111110,
      materialIcon: "star",
      activityId: null,
    });
  });

  for (const [name, path, data] of [
    [
      "a field that the item does not have",
      "group/group-work",
      { color: "red" },
    ],
    [
      "a sort value that is not a whole number",
      "group/group-work",
      { sortOrder: 1.5 },
    ],
    [
      "an archived flag that is not a flag",
      "activity/activity-gym",
      { archived: "yes" },
    ],
    [
      "a group that does not exist",
      "activity/activity-gym",
      { groupId: "group-missing" },
    ],
    ["an empty group ID", "activity/activity-gym", { groupId: " " }],
    [
      "a reminder time that is not a time",
      "goal/goal-read",
      { reminderTime: "25:99" },
    ],
    [
      "an activity that does not exist for a goal",
      "goal/goal-read",
      { activityId: "activity-missing" },
    ],
    [
      "a weekly goal with no days",
      "goal/goal-read",
      { repeatType: "weekly", targetPerWeek: 0 },
    ],
    ["an item that does not exist", "group/group-missing", { name: "x" }],
    ["an item of a kind that does not exist", "mood/mood-good", { name: "x" }],
  ] as const) {
    test(`should refuse a change with ${name}`, async ({
      ownerRequest,
      apiOrigin,
    }) => {
      const response = await ownerRequest.patch(
        `${apiOrigin}/api/catalog/${path}`,
        { data },
      );

      expect(response.status()).toBe(400);
    });
  }

  test("should delete an item once", async ({ ownerRequest, apiOrigin }) => {
    const first = await ownerRequest.delete(
      `${apiOrigin}/api/catalog/goal/goal-read`,
    );
    expect(first.status()).toBe(200);
    expect(await first.json()).toEqual({ success: true });

    const again = await ownerRequest.delete(
      `${apiOrigin}/api/catalog/goal/goal-read`,
    );
    expect(again.status()).toBe(400);
    const unknownKind = await ownerRequest.delete(
      `${apiOrigin}/api/catalog/mood/mood-good`,
    );
    expect(unknownKind.status()).toBe(400);
    const activity = await ownerRequest.delete(
      `${apiOrigin}/api/catalog/group/group-home`,
    );
    expect(activity.status()).toBe(200);
  });

  test("should refuse a move from a stale view, and keep every sort value", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const reorder = (updates: unknown) =>
      ownerRequest.post(`${apiOrigin}/api/catalog/reorder`, {
        data: { kind: "group", updates },
      });
    const swapped = await reorder([
      { id: "group-health", sortOrder: 1, expectedSortOrder: 0 },
      { id: "group-work", sortOrder: 0, expectedSortOrder: 1 },
    ]);
    expect(swapped.status()).toBe(200);
    expect(await swapped.json()).toEqual({ success: true });

    const stale = await reorder([
      { id: "group-health", sortOrder: 5, expectedSortOrder: 1 },
      { id: "group-work", sortOrder: 6, expectedSortOrder: 9 },
    ]);
    expect(stale.status()).toBe(409);

    // The stale move changed neither item, so the swap can go back.
    const back = await reorder([
      { id: "group-health", sortOrder: 0, expectedSortOrder: 1 },
      { id: "group-work", sortOrder: 1, expectedSortOrder: 0 },
    ]);
    expect(back.status()).toBe(200);
  });

  for (const [name, body] of [
    ["an empty list", { kind: "group", updates: [] }],
    ["a body with no list", { kind: "group" }],
    [
      "a kind that does not exist",
      {
        kind: "mood",
        updates: [{ id: "mood-good", sortOrder: 0, expectedSortOrder: 0 }],
      },
    ],
    [
      "the same item twice",
      {
        kind: "group",
        updates: [
          { id: "group-work", sortOrder: 0, expectedSortOrder: 1 },
          { id: "group-work", sortOrder: 1, expectedSortOrder: 1 },
        ],
      },
    ],
    [
      "a sort value that is not a whole number",
      {
        kind: "group",
        updates: [{ id: "group-work", sortOrder: 0.5, expectedSortOrder: 1 }],
      },
    ],
    [
      "an item that does not exist",
      {
        kind: "group",
        updates: [{ id: "group-missing", sortOrder: 0, expectedSortOrder: 0 }],
      },
    ],
    [
      "an item with no ID",
      { kind: "group", updates: [{ sortOrder: 0, expectedSortOrder: 0 }] },
    ],
  ] as const) {
    test(`should refuse a move with ${name}`, async ({
      ownerRequest,
      apiOrigin,
    }) => {
      const response = await ownerRequest.post(
        `${apiOrigin}/api/catalog/reorder`,
        { data: body },
      );

      expect(response.status()).toBe(400);
    });
  }
});
