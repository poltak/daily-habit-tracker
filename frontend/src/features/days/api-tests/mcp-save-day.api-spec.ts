import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";
import { LogPageObject } from "../black-box-tests/log-page-object.js";

const GYM = { group: "Health", name: "Gym" };

test.describe("save a day through MCP", () => {
  test("should save a day by name, by id and by score, and show it to the owner", async ({
    agent,
    ownerPage,
  }) => {
    const byName = await agent.callTool("save_day", {
      date: "2026-01-05",
      mood: "good",
      activities: ["walk", "Gym"],
    });
    expect(byName.isError).toBe(false);
    expect(byName.data).toEqual({
      saved: "created",
      day: {
        date: "2026-01-05",
        weekday: "Mon",
        mood: "Good",
        score: 4,
        activities: ["Gym", "Walk"],
        goals_completed: ["Move your body"],
      },
    });
    const byId = await agent.callTool("save_day", {
      date: "2026-01-06",
      mood: "mood-rad",
      activities: ["activity-reading"],
    });
    expect(byId.data).toMatchObject({
      day: { mood: "Rad", activities: ["Reading"], goals_completed: ["Read"] },
    });
    const byScore = await agent.callTool("save_day", {
      date: "2026-01-07",
      mood: 1,
      activities: [],
    });
    expect(byScore.data).toMatchObject({ day: { mood: "Awful", score: 1 } });

    const log = new LogPageObject(ownerPage);
    await log.goto();
    await log.goToDay("2026-01-05");
    await expect(log.chosenMood("Good")).toBeVisible();
    await expect(log.selectedActivity("Gym")).toBeVisible();
    await expect(log.selectedActivity("Walk")).toBeVisible();
    await expect(log.doneGoalSwitch("Move your body")).toBeVisible();
    await expect(log.savedButton).toBeVisible();
  });

  test("should complete a goal with no activity when the agent names it", async ({
    agent,
    ownerRequest,
    ownerPage,
    apiOrigin,
  }) => {
    const created = await ownerRequest.post(`${apiOrigin}/api/catalog`, {
      data: {
        kind: "goal",
        name: "Stretch",
        activityId: null,
        scheduleType: "daily",
      },
    });
    expect(created.status()).toBe(201);

    const result = await agent.callTool("save_day", {
      date: "2026-01-05",
      mood: "Meh",
      activities: [],
      completed_goals: ["stretch"],
    });

    expect(result.data).toMatchObject({
      day: { activities: [], goals_completed: ["Stretch"] },
    });
    const log = new LogPageObject(ownerPage);
    await log.goto();
    await log.goToDay("2026-01-05");
    await expect(log.doneGoalSwitch("Stretch")).toBeVisible();
    await expect(log.openGoalSwitch("Read")).toBeVisible();
  });

  test("should refuse an unknown, an ambiguous and a missing record, and write nothing", async ({
    agent,
    ownerRequest,
    apiOrigin,
  }) => {
    await ownerRequest.post(`${apiOrigin}/api/catalog`, {
      data: { kind: "activity", name: "Walk", groupId: "group-leisure" },
    });
    const day = { date: "2026-01-05", mood: "Good", activities: [] };

    const ambiguous = await agent.callTool("save_day", {
      ...day,
      activities: ["Walk"],
    });
    expect(ambiguous.isError).toBe(true);
    expect(ambiguous.text).toContain(
      '"Walk" matches more than one activity: "Walk (Health)", "Walk (Leisure)"',
    );
    const unknownActivity = await agent.callTool("save_day", {
      ...day,
      activities: ["Juggling"],
    });
    expect(unknownActivity.text).toContain(
      'No activity is called "Juggling". Call get_overview',
    );
    const unknownMood = await agent.callTool("save_day", {
      ...day,
      mood: "Fantastic",
    });
    expect(unknownMood.isError).toBe(true);
    expect(unknownMood.text).toContain('Unknown mood "Fantastic"');
    const unknownScore = await agent.callTool("save_day", { ...day, mood: 9 });
    expect(unknownScore.text).toContain("Unknown mood 9");
    const unknownGoal = await agent.callTool("save_day", {
      ...day,
      completed_goals: ["Fly"],
    });
    expect(unknownGoal.isError).toBe(true);

    const days = await agent.callTool("get_days", {
      start_date: "2026-01-01",
      end_date: "2026-01-31",
    });
    expect(days.data).toMatchObject({ recorded_days: 0, days: [] });
  });

  test("should refuse arguments that do not fit the schema", async ({
    agent,
  }) => {
    const valid = { date: "2026-01-05", mood: 4, activities: [] };
    const refusals: Array<[Record<string, unknown>, string]> = [
      [
        { date: "2026-01-05", mood: 4 },
        'Missing required argument "activities"',
      ],
      [{ ...valid, date: "2026-02-30" }, "real calendar date"],
      [{ ...valid, mood: 4.5 }, '"mood" must be a string or a integer'],
      [{ ...valid, activities: ["Gym", 2] }, "array of strings"],
      [{ ...valid, note: "x" }, 'Unknown argument "note"'],
    ];

    for (const [args, message] of refusals) {
      const result = await agent.callTool("save_day", args);
      expect(result.isError, message).toBe(true);
      expect(result.text).toContain(message);
    }
    const list = await agent.callTool("save_day", []);
    expect(list.text).toContain("must be an object");
  });

  test("should refuse a day that has not started", async ({ agent }) => {
    const later = LogPageObject.addDays(
      new Date().toISOString().slice(0, 10),
      2,
    );

    const result = await agent.callTool("save_day", {
      date: later,
      mood: "Good",
      activities: [],
    });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("That day has not started yet");
    const days = await agent.callTool("get_days", {
      start_date: later,
      end_date: later,
    });
    expect(days.data).toMatchObject({ recorded_days: 0 });
  });

  test("should keep a saved day unless the agent asks to replace it", async ({
    agent,
    ownerPage,
  }) => {
    const first = {
      date: "2026-01-10",
      mood: "Bad",
      activities: ["Meetings"],
    };
    await agent.callTool("save_day", first);

    const refused = await agent.callTool("save_day", {
      ...first,
      mood: "Rad",
      activities: [],
    });
    expect(refused.isError).toBe(true);
    expect(refused.text).toMatch(
      /2026-01-10 already has a saved entry.*replace_existing: true/,
    );
    const kept = await agent.callTool("get_days", {
      start_date: "2026-01-10",
      end_date: "2026-01-10",
    });
    expect(kept.data).toMatchObject({
      days: [{ mood: "Bad", activities: ["Meetings"] }],
    });

    const replaced = await agent.callTool("save_day", {
      date: "2026-01-10",
      mood: "Good",
      activities: ["Gym"],
      replace_existing: true,
    });
    expect(replaced.data).toMatchObject({
      saved: "replaced",
      day: { mood: "Good", activities: ["Gym"] },
    });
    const log = new LogPageObject(ownerPage);
    await log.goto();
    await log.goToDay("2026-01-10");
    await expect(log.chosenMood("Good")).toBeVisible();
    await expect(log.selectedActivity("Gym")).toBeVisible();
    await expect(log.selectedActivity("Meetings")).toBeHidden();

    const created = await agent.callTool("save_day", {
      date: "2026-03-01",
      mood: "Meh",
      activities: [],
      replace_existing: true,
    });
    expect(created.data).toMatchObject({ saved: "created" });
  });

  test("should refuse to overwrite a day that the owner saved on the page", async ({
    agent,
    ownerPage,
  }) => {
    const log = new LogPageObject(ownerPage);
    await log.goto();
    const today = await log.currentDate();
    await log.logDay({ mood: "Meh", activities: [GYM] });

    const refused = await agent.callTool("save_day", {
      date: today,
      mood: "Rad",
      activities: [],
    });

    expect(refused.isError).toBe(true);
    expect(refused.text).toContain(`${today} already has a saved entry`);
    await log.goto();
    await expect(log.chosenMood("Meh")).toBeVisible();
    await expect(log.selectedActivity("Gym")).toBeVisible();
  });
});
