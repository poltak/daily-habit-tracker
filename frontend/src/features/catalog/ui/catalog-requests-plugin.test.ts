import { describe, expect, it } from "vitest";
import { ApiRequestError } from "../../api/client/api-client.js";
import {
  setupLogicTest,
  type FullApplication,
} from "../../core/tests/full-application.js";
import { CatalogRequestsPlugin } from "./catalog-requests-plugin.js";

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
});
