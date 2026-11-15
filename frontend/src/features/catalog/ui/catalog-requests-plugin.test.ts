import { describe, expect, it } from "vitest";
import { ApiRequestError } from "../../api/client/api-client.js";
import {
  setupLogicTest,
  type FullApplication,
} from "../../core/tests/full-application.js";
import {
  CatalogRequestsPlugin,
  type GoalPatch,
  type ItemPatch,
} from "./catalog-requests-plugin.js";

function setupTest() {
  return setupLogicTest({}, async (app: FullApplication) => {
    await app.backend.logic.catalog.read();
    return new CatalogRequestsPlugin(app.frontend);
  });
}

describe("CatalogRequestsPlugin", () => {
  it("should read the catalog", async () => {
    const { logic } = await setupTest();

    const catalog = await logic.read();

    expect(catalog.groups).toHaveLength(5);
    expect(catalog.activities).toHaveLength(12);
    expect(catalog.goals.map((goal) => goal.id)).toEqual([
      "goal-move",
      "goal-read",
    ]);
  });

  it("should create a group, an activity and a goal", async () => {
    const { logic, backend } = await setupTest();

    const group = await logic.createGroup({ name: "  Travel " });
    const activity = await logic.createActivity({
      name: "Swimming",
      groupId: group.id,
      icon: "pool",
    });
    const goal = await logic.createGoal({
      name: "Swim",
      startDate: "2026-03-01",
    });

    expect(group).toMatchObject({ name: "Travel", sortOrder: 5 });
    expect(activity).toMatchObject({ name: "Swimming", icon: "pool" });
    expect(goal).toMatchObject({
      name: "Swim",
      activityId: null,
      startDate: "2026-03-01",
      scheduleType: "daily",
    });
    expect(
      await backend.db.selectFrom("activityGroups").select("id").execute(),
    ).toHaveLength(6);
  });

  it("should change a group, an activity and a goal", async () => {
    const { logic } = await setupTest();

    await logic.patch({
      kind: "group",
      id: "group-work",
      patch: { name: "Job" },
    });
    await logic.patch({
      kind: "group",
      id: "group-work",
      patch: { archived: true },
    });
    await logic.patch({
      kind: "activity",
      id: "activity-gym",
      patch: { groupId: "group-home", icon: "pool" },
    });
    const goal = await logic.patchGoal({
      id: "goal-read",
      patch: { name: "Read more", repeatType: "weekly", targetPerWeek: 4 },
    });

    const catalog = await logic.read();
    expect(
      catalog.groups.find((group) => group.id === "group-work"),
    ).toMatchObject({ name: "Job", archived: true });
    expect(
      catalog.activities.find((activity) => activity.id === "activity-gym"),
    ).toMatchObject({ groupId: "group-home", icon: "pool" });
    expect(goal).toMatchObject({
      name: "Read more",
      repeatType: "weekly",
      scheduleType: "times_per_week",
      targetPerWeek: 4,
    });
  });

  it("should delete a group, an activity and a goal", async () => {
    const { logic } = await setupTest();

    await logic.remove({ kind: "goal", id: "goal-read" });
    await logic.remove({ kind: "activity", id: "activity-gym" });
    await logic.remove({ kind: "group", id: "group-home" });

    const catalog = await logic.read();
    expect(catalog.goals.map((goal) => goal.id)).toEqual(["goal-move"]);
    expect(catalog.groups.map((group) => group.id)).not.toContain("group-home");
    expect(catalog.activities).toHaveLength(9);
  });

  it("should reorder items, and refuse a move from a stale view", async () => {
    const { logic } = await setupTest();

    await logic.reorder({
      kind: "group",
      updates: [
        { id: "group-health", sortOrder: 1, expectedSortOrder: 0 },
        { id: "group-work", sortOrder: 0, expectedSortOrder: 1 },
      ],
    });
    const stale = logic.reorder({
      kind: "group",
      updates: [{ id: "group-health", sortOrder: 9, expectedSortOrder: 0 }],
    });

    await expect(stale).rejects.toMatchObject({
      status: 409,
      message: "Setup changed on another device. Refresh before reordering.",
    });
    const groups = (await logic.read()).groups;
    expect(groups.map((group) => group.id).slice(0, 2)).toEqual([
      "group-work",
      "group-health",
    ]);
  });

  it("should throw the text that the owner reads when the backend refuses", async () => {
    const { logic } = await setupTest();

    const error = await logic.createGroup({ name: "   " }).catch((e) => e);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({
      status: 400,
      message: "Group name is required.",
    });
    await expect(
      logic.createActivity({
        name: "Yoga",
        groupId: "group-missing",
        icon: "category",
      }),
    ).rejects.toMatchObject({ message: "Choose an activity group." });
    await expect(
      logic.patchGoal({
        id: "goal-read",
        patch: { activityId: "activity-missing" },
      }),
    ).rejects.toMatchObject({ message: "Choose an activity for the goal." });
    await expect(
      logic.remove({ kind: "activity", id: "activity-missing" }),
    ).rejects.toMatchObject({ message: "Activity not found." });
  });

  it("should give a goal with a weekday mask the weekdays schedule", async () => {
    const { logic } = await setupTest();

    const goal = await logic.patchGoal({
      id: "goal-read",
      patch: {
        repeatType: "daily",
        weekdaysMask: 0b0111110,
        materialIcon: "star",
        activityId: null,
      },
    });

    expect(goal).toMatchObject({
      scheduleType: "weekdays",
      weekdaysMask: 0b0111110,
      materialIcon: "star",
      activityId: null,
    });
  });

  it("should pick the icon of an activity from its name when the owner chose no icon", async () => {
    const { logic } = await setupTest();

    const created = await logic.createActivity({
      name: "Test reading",
      groupId: "group-health",
      icon: "category",
    });
    await logic.patch({
      kind: "activity",
      id: "activity-gym",
      patch: { name: "Running", icon: "category", groupId: "group-home" },
    });

    const catalog = await logic.read();
    expect(created).toMatchObject({ icon: "menu_book" });
    expect(
      catalog.activities.find((activity) => activity.id === "activity-gym"),
    ).toMatchObject({ name: "Running", icon: "fitness_center" });
  });

  it("should refuse the rules of the catalog with the text that the owner reads, and change nothing", async () => {
    const { logic, backend } = await setupTest();
    const readRows = async () => ({
      groups: await backend.db
        .selectFrom("activityGroups")
        .selectAll()
        .execute(),
      activities: await backend.db
        .selectFrom("activities")
        .selectAll()
        .execute(),
      goals: await backend.db.selectFrom("goals").selectAll().execute(),
    });
    const patchGoal = (patch: Record<string, unknown>) =>
      logic.patchGoal({ id: "goal-read", patch: patch as GoalPatch });
    const rows: [string, () => Promise<unknown>, string][] = [
      [
        "an empty name",
        () => logic.createGroup({ name: " " }),
        "Group name is required.",
      ],
      [
        "an activity with no group",
        () =>
          logic.createActivity({
            name: "Yoga",
            groupId: undefined as unknown as string,
            icon: "category",
          }),
        "Choose an activity group.",
      ],
      [
        "an activity in an unknown group",
        () =>
          logic.createActivity({
            name: "Yoga",
            groupId: "group-gone",
            icon: "category",
          }),
        "Choose an activity group.",
      ],
      [
        "a goal for an unknown activity",
        () => patchGoal({ activityId: "activity-gone" }),
        "Choose an activity for the goal.",
      ],
      [
        "an unknown schedule",
        () => patchGoal({ scheduleType: "monthly" }),
        "Choose Daily or Weekly for goal repeat.",
      ],
      [
        "the weekday mask 0",
        () => patchGoal({ repeatType: "daily", weekdaysMask: 0 }),
        "Daily goals must include at least one weekday.",
      ],
      [
        "the weekday mask 128",
        () => patchGoal({ repeatType: "daily", weekdaysMask: 128 }),
        "Daily goals must include at least one weekday.",
      ],
      [
        "a weekly goal with 0 days",
        () => patchGoal({ repeatType: "weekly", targetPerWeek: 0 }),
        "Weekly goals must target between 1 and 7 days.",
      ],
      [
        "a weekly goal with 8 days",
        () => patchGoal({ repeatType: "weekly", targetPerWeek: 8 }),
        "Weekly goals must target between 1 and 7 days.",
      ],
      [
        "a start date that is not a date",
        () => logic.createGoal({ name: "Swim", startDate: "2026-02-30" }),
        "Choose a valid goal start date.",
      ],
      [
        "the reminder time 25:00",
        () => patchGoal({ reminderTime: "25:00" }),
        "Choose a valid reminder time.",
      ],
      [
        "the reminder time 8:30",
        () => patchGoal({ reminderTime: "8:30" }),
        "Choose a valid reminder time.",
      ],
      [
        "a field that an activity does not have",
        () =>
          logic.patch({
            kind: "activity",
            id: "activity-gym",
            patch: { reminderTime: "08:30" } as ItemPatch,
          }),
        "Unsupported activity field: reminderTime.",
      ],
      [
        "a field that a goal does not have",
        () => patchGoal({ startDate: "2026-01-01" }),
        "Unsupported goal field: startDate.",
      ],
      [
        "an empty list of moves",
        () => logic.reorder({ kind: "group", updates: [] }),
        "Choose items to reorder.",
      ],
      [
        "a move of the same item twice",
        () =>
          logic.reorder({
            kind: "group",
            updates: [
              { id: "group-work", sortOrder: 0, expectedSortOrder: 1 },
              { id: "group-work", sortOrder: 1, expectedSortOrder: 1 },
            ],
          }),
        "Reorder item IDs must be unique non-empty strings.",
      ],
      [
        "a move of an item that does not exist",
        () =>
          logic.reorder({
            kind: "group",
            updates: [
              { id: "group-missing", sortOrder: 0, expectedSortOrder: 0 },
            ],
          }),
        "Catalog item not found.",
      ],
    ];
    const before = await readRows();

    for (const [name, send, text] of rows) {
      const error = await send().catch((e: unknown) => e);

      expect(error, name).toBeInstanceOf(ApiRequestError);
      const { status, message, issues } = error as ApiRequestError;
      expect(status, name).toBe(400);
      expect(
        [message, ...(issues ?? []).map((issue) => issue.message)].join(" "),
        name,
      ).toContain(text);
      expect(await readRows(), name).toEqual(before);
    }
  });
});
