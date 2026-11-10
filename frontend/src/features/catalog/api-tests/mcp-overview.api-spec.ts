import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";

test.describe("overview through MCP", () => {
  test("should describe the moods, the activities, the goals and an empty history", async ({
    agent,
  }) => {
    const overview = await agent.callTool("get_overview", {});

    expect(overview.isError).toBe(false);
    expect(overview.data).toMatchObject({
      history: { first_day: null, last_day: null, recorded_days: 0 },
      week: "Monday–Sunday",
    });
    expect(overview.data).toMatchObject({
      moods: [
        { name: "Rad", score: 5 },
        { name: "Good", score: 4 },
        { name: "Meh", score: 3 },
        { name: "Bad", score: 2 },
        { name: "Awful", score: 1 },
      ],
      goals: [
        {
          name: "Move your body",
          schedule: "3 days per week",
          linked_activity: "Gym",
          start_date: null,
        },
        {
          name: "Read",
          schedule: "Every day",
          linked_activity: "Reading",
          start_date: null,
        },
      ],
    });
    const groups = (
      overview.data as {
        activity_groups: Array<{
          group: string;
          activities: Array<{ name: string }>;
        }>;
      }
    ).activity_groups;
    expect(groups.map((group) => group.group)).toEqual([
      "Health",
      "Work",
      "Home",
      "People",
      "Leisure",
    ]);
    expect(groups[0]?.activities.map((activity) => activity.name)).toEqual([
      "Gym",
      "Walk",
      "Sleep",
    ]);
  });

  test("should count the recorded days and follow the owner's catalog and week", async ({
    agent,
    ownerRequest,
    apiOrigin,
  }) => {
    await agent.callTool("save_day", {
      date: "2025-12-31",
      mood: "Awful",
      activities: [],
    });
    await agent.callTool("save_day", {
      date: "2026-02-02",
      mood: "Good",
      activities: [],
    });
    await ownerRequest.post(`${apiOrigin}/api/catalog`, {
      data: { kind: "activity", name: "Walk", groupId: "group-leisure" },
    });
    await ownerRequest.post(`${apiOrigin}/api/catalog`, {
      data: {
        kind: "goal",
        name: "Stretch",
        activityId: null,
        scheduleType: "daily",
        startDate: "2025-12-01",
      },
    });
    const week = await ownerRequest.patch(`${apiOrigin}/api/settings`, {
      data: { weekEndsOn: 6 },
    });
    expect(week.status()).toBe(200);

    const overview = await agent.callTool("get_overview", {});

    expect(overview.data).toMatchObject({
      history: {
        first_day: "2025-12-31",
        last_day: "2026-02-02",
        recorded_days: 2,
      },
      week: "Sunday–Saturday",
    });
    const data = overview.data as {
      activity_groups: Array<{
        group: string;
        activities: Array<{ name: string }>;
      }>;
      goals: Array<{ name: string; start_date: string | null }>;
    };
    const names = (group: string) =>
      data.activity_groups
        .find((entry) => entry.group === group)
        ?.activities.map((activity) => activity.name);
    expect(names("Health")).toContain("Walk (Health)");
    expect(names("Leisure")).toContain("Walk (Leisure)");
    expect(data.goals.find((goal) => goal.name === "Stretch")).toMatchObject({
      start_date: "2025-12-01",
    });
  });
});
