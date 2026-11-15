import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";

const DAYS = [
  { date: "2026-01-05", mood: "Good", activities: ["Gym"] },
  { date: "2026-01-06", mood: "Rad", activities: ["Gym", "Reading"] },
  { date: "2026-01-10", mood: "Bad", activities: ["Meetings"] },
  { date: "2026-02-02", mood: "Meh", activities: [] },
];

test.describe("read days through MCP", () => {
  test("should return each recorded day of a range, oldest first, with no empty days", async ({
    agent,
  }) => {
    for (const day of DAYS) {
      await agent.callTool("save_day", day);
    }

    const january = await agent.callTool("get_days", {
      start_date: "2026-01-01",
      end_date: "2026-01-31",
    });

    expect(january.isError).toBe(false);
    expect(january.data).toMatchObject({
      days_in_range: 31,
      recorded_days: 3,
    });
    expect(january.data).toMatchObject({
      days: [
        {
          date: "2026-01-05",
          weekday: "Mon",
          mood: "Good",
          score: 4,
          activities: ["Gym"],
          goals_completed: ["Move your body"],
        },
        {
          date: "2026-01-06",
          weekday: "Tue",
          mood: "Rad",
          score: 5,
          activities: ["Gym", "Reading"],
          goals_completed: ["Move your body", "Read"],
        },
        {
          date: "2026-01-10",
          weekday: "Sat",
          mood: "Bad",
          score: 2,
          activities: ["Meetings"],
          goals_completed: [],
        },
      ],
    });
    const empty = await agent.callTool("get_days", {
      start_date: "2026-03-01",
      end_date: "2026-03-31",
    });
    expect(empty.data).toMatchObject({ recorded_days: 0, days: [] });
  });

  test("should see a change that the owner made through the API", async ({
    agent,
    ownerRequest,
    apiOrigin,
  }) => {
    await agent.callTool("save_day", DAYS[0]);
    const changed = await ownerRequest.put(
      `${apiOrigin}/api/entries/2026-01-05`,
      {
        data: {
          moodId: "mood-awful",
          activityIds: ["activity-sleep"],
          completedGoalIds: [],
          localTime: "20:00",
          expectedVersion: 1,
        },
      },
    );
    expect(changed.status()).toBe(200);

    const days = await agent.callTool("get_days", {
      start_date: "2026-01-05",
      end_date: "2026-01-05",
    });

    expect(days.data).toMatchObject({
      days: [{ mood: "Awful", score: 1, activities: ["Sleep"] }],
    });
  });

  test("should refuse a range that is too long, reversed or incomplete", async ({
    agent,
  }) => {
    const long = await agent.callTool("get_days", {
      start_date: "2025-01-01",
      end_date: "2026-01-02",
    });
    expect(long.isError).toBe(true);
    expect(long.text).toContain("at most 366 days per call");

    const yearLong = await agent.callTool("get_days", {
      start_date: "2026-01-01",
      end_date: "2026-12-31",
    });
    expect(yearLong.isError).toBe(false);

    const reversed = await agent.callTool("get_days", {
      start_date: "2026-02-01",
      end_date: "2026-01-01",
    });
    expect(reversed.isError).toBe(true);
    expect(reversed.text).toContain("must not be after");

    const incomplete = await agent.callTool("get_days", {
      start_date: "2026-01-01",
    });
    expect(incomplete.isError).toBe(true);
    expect(incomplete.text).toContain('Missing required argument "end_date"');
  });
});
