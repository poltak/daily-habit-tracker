import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";

const DATES = ["2026-02-02", "2026-02-03", "2026-02-04"];

test.describe("list of entries", () => {
  test("should page through the saved days, newest first", async ({
    agent,
    ownerRequest,
    apiOrigin,
  }) => {
    for (const date of DATES) {
      await agent.callTool("save_day", { date, mood: "Good", activities: [] });
    }

    const first = await ownerRequest.get(
      `${apiOrigin}/api/entries?limit=1&offset=0`,
    );
    expect(first.status()).toBe(200);
    const firstPage = await first.json();
    expect(firstPage).toMatchObject({ hasMore: true, nextOffset: 1 });
    expect(firstPage.entries).toHaveLength(1);
    expect(firstPage.entries[0]).toMatchObject({
      logicalDate: "2026-02-04",
      moodId: "mood-good",
    });
    const second = await (
      await ownerRequest.get(`${apiOrigin}/api/entries?limit=1&offset=1`)
    ).json();
    expect(second).toMatchObject({ hasMore: true, nextOffset: 2 });
    expect(second.entries[0]).toMatchObject({ logicalDate: "2026-02-03" });
    const last = await (
      await ownerRequest.get(`${apiOrigin}/api/entries?limit=2&offset=2`)
    ).json();
    expect(last).toMatchObject({ hasMore: false, nextOffset: 3 });
    expect(last.entries).toHaveLength(1);
    expect(last.entries[0]).toMatchObject({ logicalDate: "2026-02-02" });
  });

  test("should round a fractional page and use the default size", async ({
    agent,
    ownerRequest,
    apiOrigin,
  }) => {
    for (const date of DATES) {
      await agent.callTool("save_day", { date, mood: "Good", activities: [] });
    }

    const fractional = await ownerRequest.get(
      `${apiOrigin}/api/entries?limit=1.5&offset=1.5`,
    );
    const whole = await ownerRequest.get(
      `${apiOrigin}/api/entries?limit=1&offset=1`,
    );
    const standard = await (
      await ownerRequest.get(`${apiOrigin}/api/entries`)
    ).json();

    expect(await fractional.json()).toEqual(await whole.json());
    expect(standard.entries).toHaveLength(3);
    expect(standard.hasMore).toBe(false);
  });

  test("should give the activities and goals of each day", async ({
    agent,
    ownerRequest,
    apiOrigin,
  }) => {
    await agent.callTool("save_day", {
      date: "2026-02-02",
      mood: "Rad",
      activities: ["Gym"],
    });

    const body = await (
      await ownerRequest.get(`${apiOrigin}/api/entries`)
    ).json();

    expect(body.entries).toMatchObject([
      {
        logicalDate: "2026-02-02",
        activityIds: ["activity-gym"],
        completedGoalIds: ["goal-move"],
        version: 1,
      },
    ]);
  });
});
