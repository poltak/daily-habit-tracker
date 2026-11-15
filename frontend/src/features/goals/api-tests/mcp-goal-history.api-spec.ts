import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";
import { GoalPageObject } from "../black-box-tests/goal-page-object.js";

test.describe("goal history through MCP", () => {
  test("should list the completed dates and the result of each week", async ({
    agent,
  }) => {
    await agent.callTool("save_day", {
      date: "2026-01-05",
      mood: "Good",
      activities: ["Gym"],
    });
    await agent.callTool("save_day", {
      date: "2026-01-06",
      mood: "Rad",
      activities: ["Gym", "Reading"],
    });

    const history = await agent.callTool("get_goal_history", {
      goal: "move your body",
      start_date: "2026-01-01",
      end_date: "2026-01-31",
      today: "2026-01-20",
    });

    expect(history.isError).toBe(false);
    expect(history.data).toMatchObject({
      goal: { id: "goal-move" },
      completed_dates: ["2026-01-05", "2026-01-06"],
      week_results: {
        accomplished: 0,
        not_accomplished: 3,
        in_progress: 1,
        upcoming: 1,
      },
      weeks: [
        {
          week_start: "2025-12-29",
          status: "not_accomplished",
          completed_days: 0,
          expected_days: 3,
        },
        {
          week_start: "2026-01-05",
          status: "not_accomplished",
          completed_days: 2,
          expected_days: 3,
        },
        { week_start: "2026-01-12", status: "not_accomplished" },
        { week_start: "2026-01-19", status: "in_progress" },
        { week_start: "2026-01-26", status: "upcoming" },
      ],
    });
    const byId = await agent.callTool("get_goal_history", {
      goal: "goal-read",
      start_date: "2026-01-01",
      end_date: "2026-01-31",
      today: "2026-01-20",
    });
    expect(byId.data).toMatchObject({ completed_dates: ["2026-01-06"] });
  });

  test("should show the owner a goal that the agent completed", async ({
    agent,
    ownerPage,
  }) => {
    const today = new Date().toISOString().slice(0, 10);
    await agent.callTool("save_day", {
      date: today,
      mood: "Good",
      activities: ["Gym"],
    });
    await ownerPage.goto("/?view=settings");

    const goal = new GoalPageObject(ownerPage);
    await goal.openFromSetup("Move your body");

    await expect(goal.day(today, "completed")).toBeVisible();
    const history = await agent.callTool("get_goal_history", {
      goal: "Move your body",
      start_date: today,
      end_date: today,
    });
    expect(history.data).toMatchObject({ completed_dates: [today] });
  });

  test("should refuse an unknown goal and a bad range", async ({ agent }) => {
    const unknown = await agent.callTool("get_goal_history", {
      goal: "Fly",
      start_date: "2026-01-01",
      end_date: "2026-01-31",
    });
    expect(unknown.isError).toBe(true);
    expect(unknown.text).toContain('No goal is called "Fly"');

    const long = await agent.callTool("get_goal_history", {
      goal: "Read",
      start_date: "2025-01-01",
      end_date: "2026-01-02",
    });
    expect(long.isError).toBe(true);
    expect(long.text).toContain("at most 366 days per call");

    const missing = await agent.callTool("get_goal_history", {
      goal: "Read",
      start_date: "2026-01-01",
    });
    expect(missing.text).toContain('Missing required argument "end_date"');
  });
});
