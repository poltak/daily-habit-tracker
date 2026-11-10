import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";

/**
 * A small Daylio backup in the normalized form that `scripts/daylio_import.py`
 * makes from a backup file and sends to `POST /api/import`.
 */
function backup() {
  return {
    sourceSystem: "daylio",
    sourceSha256: "black-box-backup",
    moods: [
      { sourceId: "1", name: "rad", score: 5 },
      { sourceId: "2", name: "good", score: 4 },
      { sourceId: "3", name: "meh", score: 3 },
      { sourceId: "4", name: "bad", score: 2 },
      { sourceId: "5", name: "awful", score: 1 },
    ],
    groups: [{ sourceId: "1", name: "Imported group", sortOrder: 0 }],
    activities: [
      {
        sourceId: "1",
        groupSourceId: "1",
        name: "Imported book",
        sourceIconId: "123",
        sortOrder: 0,
        sourceState: 0,
      },
    ],
    goals: [
      {
        sourceId: "1",
        activitySourceId: null,
        name: "Imported goal",
        scheduleType: "daily",
        sortOrder: 0,
        sourceState: 1,
      },
    ],
    entries: [
      {
        sourceId: "1",
        logicalDate: "2020-01-01",
        localTime: "20:00",
        moodSourceId: "2",
        activitySourceIds: ["1"],
        legacyNote: "A note from the backup",
      },
      {
        sourceId: "2",
        logicalDate: "2020-01-02",
        localTime: "21:30",
        moodSourceId: "4",
        activitySourceIds: [],
      },
    ],
    completions: [
      {
        sourceId: "1",
        goalSourceId: "1",
        logicalDate: "2020-01-01",
        localTime: "20:00:00",
      },
    ],
  };
}

test.describe("import of a Daylio backup", () => {
  test("should add the catalog and the days of the backup", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const response = await ownerRequest.post(`${apiOrigin}/api/import`, {
      data: backup(),
    });

    expect(response.status()).toBe(200);
    const { bootstrap } = await response.json();
    expect(bootstrap.groups).toContainEqual(
      expect.objectContaining({ name: "Imported group" }),
    );
    expect(bootstrap.activities).toContainEqual(
      expect.objectContaining({ name: "Imported book" }),
    );
    expect(bootstrap.goals).toContainEqual(
      expect.objectContaining({ name: "Imported goal", activityId: null }),
    );
    expect(bootstrap.moods).toHaveLength(5);
    const first = await ownerRequest.get(`${apiOrigin}/api/entries/2020-01-01`);
    expect((await first.json()).entry).toMatchObject({
      logicalDate: "2020-01-01",
      moodId: "mood-good",
      localTime: "20:00",
      activityIds: [expect.any(String)],
      completedGoalIds: [expect.any(String)],
      legacyNote: "A note from the backup",
    });
    const second = await ownerRequest.get(
      `${apiOrigin}/api/entries/2020-01-02`,
    );
    expect((await second.json()).entry).toMatchObject({
      moodId: "mood-bad",
      activityIds: [],
    });
  });

  test("should keep the standard moods and their faces", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const response = await ownerRequest.post(`${apiOrigin}/api/import`, {
      data: backup(),
    });

    const { bootstrap } = await response.json();
    const moods = Object.fromEntries(
      bootstrap.moods.map((mood: { id: string; emoji: string }) => [
        mood.id,
        mood.emoji,
      ]),
    );
    expect(moods).toEqual({
      "mood-rad": "😄",
      "mood-good": "🙂",
      "mood-meh": "😐",
      "mood-bad": "☹️",
      "mood-awful": "😫",
    });
  });

  test("should give the same journal when the same backup comes again", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    await ownerRequest.post(`${apiOrigin}/api/import`, { data: backup() });
    const changed = backup();
    changed.entries[0] = { ...changed.entries[0]!, legacyNote: "Edited" };

    const again = await ownerRequest.post(`${apiOrigin}/api/import`, {
      data: changed,
    });

    expect(again.status()).toBe(200);
    const { bootstrap } = await again.json();
    expect(
      bootstrap.groups.filter(
        (group: { name: string }) => group.name === "Imported group",
      ),
    ).toHaveLength(1);
    const entry = await ownerRequest.get(`${apiOrigin}/api/entries/2020-01-01`);
    expect((await entry.json()).entry).toMatchObject({
      legacyNote: "Edited",
      version: 2,
    });
    const list = await ownerRequest.get(`${apiOrigin}/api/entries`);
    expect((await list.json()).entries).toHaveLength(2);
  });

  test("should refuse a file that is not a Daylio backup, and change nothing", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const before = await (
      await ownerRequest.get(`${apiOrigin}/api/bootstrap`)
    ).json();
    const unknownGoal = backup();
    unknownGoal.completions[0]!.goalSourceId = "missing";
    const badDate = backup();
    badDate.entries[0]!.logicalDate = "2020-02-30";
    const sameDay = backup();
    sameDay.entries[1]!.logicalDate = "2020-01-01";
    const noEntries = { ...backup(), entries: null };
    const refusals: Array<[unknown, RegExp]> = [
      [{ ...backup(), sourceSystem: "other" }, /Only Daylio/],
      [unknownGoal, /unknown record/],
      [badDate, /invalid date/],
      [sameDay, /more than one entry for a date/],
      [noEntries, /entries must be an array/],
      [[], /JSON body must be an object/],
    ];

    for (const [data, message] of refusals) {
      const response = await ownerRequest.post(`${apiOrigin}/api/import`, {
        data,
      });
      expect(response.status(), String(message)).toBe(400);
      expect((await response.json()).error).toMatch(message);
    }

    const notJson = await ownerRequest.post(`${apiOrigin}/api/import`, {
      headers: { "content-type": "text/plain" },
      data: "{}",
    });
    expect(notJson.status()).toBe(400);
    expect((await notJson.json()).error).toContain("Expected a JSON request");
    const after = await (
      await ownerRequest.get(`${apiOrigin}/api/bootstrap`)
    ).json();
    expect(after).toEqual(before);
    const missing = await ownerRequest.get(
      `${apiOrigin}/api/entries/2020-01-01`,
    );
    expect(missing.status()).toBe(404);
  });

  test("should refuse to replace a day that the owner recorded", async ({
    agent,
    ownerRequest,
    apiOrigin,
  }) => {
    await agent.callTool("save_day", {
      date: "2020-01-01",
      mood: "Rad",
      activities: ["Gym"],
    });

    const response = await ownerRequest.post(`${apiOrigin}/api/import`, {
      data: backup(),
    });

    expect(response.status()).toBe(400);
    expect((await response.json()).error).toContain("different source");
    const days = await agent.callTool("get_days", {
      start_date: "2020-01-01",
      end_date: "2020-01-02",
    });
    expect(days.data).toMatchObject({
      recorded_days: 1,
      days: [{ mood: "Rad", activities: ["Gym"] }],
    });
  });
});
