import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";

const DAY = "2026-01-05";

test.describe("goal completion and history routes", () => {
  test("should complete a goal with its activity, and list the day in the history", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    await ownerRequest.get(`${apiOrigin}/api/catalog`);

    const completed = await ownerRequest.put(
      `${apiOrigin}/api/goal-completions/${DAY}/goal-read`,
      { data: { completed: true } },
    );

    expect(completed.status()).toBe(200);
    expect(await completed.json()).toMatchObject({
      completion: { goalId: "goal-read", logicalDate: DAY, completed: true },
      selection: {
        logicalDate: DAY,
        activityId: "activity-reading",
        selected: true,
      },
      affectedGoalCompletions: [
        { goalId: "goal-read", logicalDate: DAY, completed: true },
      ],
      affectedActivitySelections: [
        { activityId: "activity-reading", selected: true },
      ],
    });
    const history = await ownerRequest.get(
      `${apiOrigin}/api/goals/goal-read/history?month=2026-01&asOf=2026-01-20`,
    );
    expect(history.status()).toBe(200);
    const body = await history.json();
    expect(body).toMatchObject({
      goal: { id: "goal-read" },
      month: "2026-01",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      asOf: "2026-01-20",
    });
    expect(body.days).toHaveLength(31);
    expect(
      body.days.filter((day: { completed: boolean }) => day.completed),
    ).toEqual([{ logicalDate: DAY, completed: true, scheduled: true }]);
    expect(body.weeks[0]).toMatchObject({
      weekStart: "2025-12-29",
      weekEnd: "2026-01-04",
    });
  });

  test("should refuse a history with no current date, and a bad month", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    await ownerRequest.get(`${apiOrigin}/api/catalog`);

    const noDate = await ownerRequest.get(
      `${apiOrigin}/api/goals/goal-read/history?month=2026-01`,
    );
    const badDate = await ownerRequest.get(
      `${apiOrigin}/api/goals/goal-read/history?month=2026-01&asOf=soon`,
    );
    const badMonth = await ownerRequest.get(
      `${apiOrigin}/api/goals/goal-read/history?month=January&asOf=2026-01-20`,
    );
    const unknown = await ownerRequest.get(
      `${apiOrigin}/api/goals/goal-gone/history?month=2026-01&asOf=2026-01-20`,
    );

    expect(noDate.status()).toBe(400);
    expect(badDate.status()).toBe(400);
    expect(badMonth.status()).toBe(400);
    expect(unknown.status()).toBe(400);
  });

  test("should refuse a completion that is not a boolean, a bad date and an unknown goal", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    await ownerRequest.get(`${apiOrigin}/api/catalog`);

    const notBoolean = await ownerRequest.put(
      `${apiOrigin}/api/goal-completions/${DAY}/goal-read`,
      { data: { completed: "yes" } },
    );
    const badDate = await ownerRequest.put(
      `${apiOrigin}/api/goal-completions/yesterday/goal-read`,
      { data: { completed: true } },
    );
    const unknown = await ownerRequest.put(
      `${apiOrigin}/api/goal-completions/${DAY}/goal-gone`,
      { data: { completed: true } },
    );

    expect(notBoolean.status()).toBe(400);
    expect(badDate.status()).toBe(400);
    expect(unknown.status()).toBe(400);
  });

  test("should give a client with no session nothing", async ({
    anonymousRequest,
    apiOrigin,
  }) => {
    const history = await anonymousRequest.get(
      `${apiOrigin}/api/goals/goal-read/history?month=2026-01&asOf=2026-01-20`,
    );
    const completion = await anonymousRequest.put(
      `${apiOrigin}/api/goal-completions/${DAY}/goal-read`,
      { headers: { origin: apiOrigin }, data: { completed: true } },
    );

    expect(history.status()).toBe(401);
    expect(completion.status()).toBe(401);
    expect(await history.text()).not.toContain("goal-read");
  });
});
