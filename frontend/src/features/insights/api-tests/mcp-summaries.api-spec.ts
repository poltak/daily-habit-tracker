import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";
import type { McpClient } from "../../core/api-tests/mcp-client.js";
import { InsightsPageObject } from "../black-box-tests/insights-page-object.js";

const DAYS = [
  { date: "2025-12-31", mood: "Awful", activities: ["Sleep"] },
  { date: "2026-01-05", mood: "Good", activities: ["Gym"] },
  { date: "2026-01-06", mood: "Rad", activities: ["Gym", "Reading"] },
  { date: "2026-01-10", mood: "Bad", activities: ["Meetings"] },
  { date: "2026-02-02", mood: "Meh", activities: [] },
];

async function recordDays(agent: McpClient): Promise<void> {
  for (const day of DAYS) {
    await agent.callTool("save_day", day);
  }
}

test.describe("summaries through MCP", () => {
  test("should summarize the mood by month, with the whole range", async ({
    agent,
  }) => {
    await recordDays(agent);

    const summary = await agent.callTool("summarize_mood", {});

    expect(summary.isError).toBe(false);
    expect(summary.data).toMatchObject({
      start_date: "2025-12-31",
      end_date: "2026-02-02",
      recorded_days: 5,
      mean_mood: 3,
      good_share: 0.4,
      group_by: "month",
      distribution: { Awful: 1, Bad: 1, Meh: 1, Good: 1, Rad: 1 },
      periods: [
        { period: "2025-12", recorded_days: 1, mean_mood: 1 },
        { period: "2026-01", recorded_days: 3, mean_mood: 3.67 },
        { period: "2026-02", recorded_days: 1, mean_mood: 3 },
      ],
    });
  });

  test("should group the mood by weekday, week, year or not at all", async ({
    agent,
  }) => {
    await recordDays(agent);

    const weekday = await agent.callTool("summarize_mood", {
      group_by: "weekday",
    });
    expect(weekday.data).toMatchObject({
      periods: [
        { period: "Monday", recorded_days: 2 },
        { period: "Tuesday", recorded_days: 1 },
        { period: "Wednesday", recorded_days: 1 },
        { period: "Saturday", recorded_days: 1 },
      ],
    });
    const week = await agent.callTool("summarize_mood", {
      group_by: "week",
      start_date: "2026-01-01",
      end_date: "2026-01-31",
    });
    expect(week.data).toMatchObject({
      periods: [
        {
          period: "2026-01-05",
          week_end: "2026-01-11",
          recorded_days: 3,
          mean_mood: 3.67,
        },
      ],
    });
    const year = await agent.callTool("summarize_mood", { group_by: "year" });
    expect(
      (year.data as { periods: Array<{ period: string }> }).periods.map(
        (period) => period.period,
      ),
    ).toEqual(["2025", "2026"]);
    const whole = await agent.callTool("summarize_mood", {
      group_by: "none",
      start_date: "2026-01-01",
    });
    expect(whole.data).toMatchObject({
      recorded_days: 4,
      periods: [],
      end_date: "2026-02-02",
    });
  });

  test("should refuse a grouping that does not exist", async ({ agent }) => {
    const result = await agent.callTool("summarize_mood", {
      group_by: "decade",
    });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("one of: month, year, week, weekday, none");
  });

  test("should rank the activities by their link to the mood", async ({
    agent,
  }) => {
    await recordDays(agent);

    const summary = await agent.callTool("summarize_activities", {});

    expect(summary.isError).toBe(false);
    const data = summary.data as {
      recorded_days: number;
      activities: Array<{ activity: string; days: number }>;
    };
    expect(data.recorded_days).toBe(5);
    expect(data.activities.map((row) => row.activity)).toEqual([
      "Gym",
      "Reading",
      "Meetings",
      "Sleep",
    ]);
    expect(data.activities[0]).toEqual({
      activity: "Gym",
      group: "Health",
      days: 2,
      share_of_days: 0.4,
      mean_mood_with: 4.5,
      mean_mood_without: 2,
      difference: 2.5,
      small_sample: true,
    });
    const frequent = await agent.callTool("summarize_activities", {
      min_days: 2,
    });
    expect(
      (frequent.data as { activities: Array<{ activity: string }> }).activities,
    ).toMatchObject([{ activity: "Gym" }]);
  });

  test("should refuse a minimum of zero days", async ({ agent }) => {
    const result = await agent.callTool("summarize_activities", {
      min_days: 0,
    });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("at least 1");
  });

  test("should show the owner the days that the agent recorded", async ({
    agent,
    ownerPage,
  }) => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    await agent.callTool("save_day", {
      date: today,
      mood: "Rad",
      activities: ["Gym"],
    });
    await agent.callTool("save_day", {
      date: yesterday,
      mood: "Good",
      activities: ["Gym", "Music"],
    });

    const insights = new InsightsPageObject(ownerPage);
    await insights.goto();

    await expect(insights.emptyHistory).toBeHidden();
    await expect(insights.summary).toMatchAriaSnapshot(`
      - group "Selected period summary":
        - strong: "2"
        - text: recorded days
        - strong: 100%
        - text: of days recorded
        - strong: "2"
        - text: activities recorded
    `);
  });
});
