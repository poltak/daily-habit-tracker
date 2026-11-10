import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";

interface Row {
  [column: string]: unknown;
}

interface ExportFile {
  formatVersion: number;
  exportedAt: string;
  tables: Record<string, Row[]>;
}

test.describe("owner export", () => {
  test("should be a JSON download with the catalog of a new journal", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const response = await ownerRequest.get(`${apiOrigin}/api/export`);

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");
    expect(response.headers()["content-disposition"]).toBe(
      'attachment; filename="daylio-clone-export.json"',
    );
    const file = (await response.json()) as ExportFile;
    expect(file.formatVersion).toBe(1);
    expect(new Date(file.exportedAt).toISOString()).toBe(file.exportedAt);
    expect(Object.keys(file.tables).toSorted()).toEqual([
      "activities",
      "activity_groups",
      "app_settings",
      "day_activity_selections",
      "day_mood_selections",
      "entries",
      "entry_activities",
      "goal_completions",
      "goals",
      "import_runs",
      "mood_levels",
    ]);
    expect(file.tables["mood_levels"]).toHaveLength(5);
    expect(file.tables["activity_groups"]).toHaveLength(5);
    expect(file.tables["activities"]).toHaveLength(12);
    expect(file.tables["goals"]).toHaveLength(2);
    expect(file.tables["entries"]).toEqual([]);
    expect(file.tables["import_runs"]).toEqual([]);
  });

  test("should hold each saved day with its activities, and the week setting", async ({
    agent,
    ownerRequest,
    apiOrigin,
  }) => {
    await agent.callTool("save_day", {
      date: "2026-01-05",
      mood: "Good",
      activities: ["Gym", "Reading"],
    });
    await ownerRequest.patch(`${apiOrigin}/api/settings`, {
      data: { weekEndsOn: 6 },
    });

    const file = (await (
      await ownerRequest.get(`${apiOrigin}/api/export`)
    ).json()) as ExportFile;

    const entries = file.tables["entries"] ?? [];
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      logical_date: "2026-01-05",
      mood_id: "mood-good",
      version: 1,
    });
    const activities = (file.tables["entry_activities"] ?? [])
      .filter((row) => row["entry_id"] === entries[0]?.["id"])
      .map((row) => row["activity_id"])
      .toSorted();
    expect(activities).toEqual(["activity-gym", "activity-reading"]);
    expect(file.tables["goal_completions"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          goal_id: "goal-move",
          logical_date: "2026-01-05",
        }),
        expect.objectContaining({
          goal_id: "goal-read",
          logical_date: "2026-01-05",
        }),
      ]),
    );
    expect(file.tables["app_settings"]).toEqual([
      expect.objectContaining({ key: "week_ends_on", value: "6" }),
    ]);
  });

  test("should hold the choices of a day that has no saved entry", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const date = "2026-02-01";
    await ownerRequest.put(`${apiOrigin}/api/day-selections/${date}/mood`, {
      data: { moodId: "mood-rad" },
    });
    await ownerRequest.put(
      `${apiOrigin}/api/day-selections/${date}/activities/activity-walk`,
      { data: { selected: false } },
    );
    await ownerRequest.put(
      `${apiOrigin}/api/goal-completions/${date}/goal-move`,
      {
        data: { completed: true },
      },
    );

    const file = (await (
      await ownerRequest.get(`${apiOrigin}/api/export`)
    ).json()) as ExportFile;

    expect(file.tables["entries"]).toEqual([]);
    expect(file.tables["day_mood_selections"]).toEqual([
      expect.objectContaining({ logical_date: date, mood_id: "mood-rad" }),
    ]);
    // Completing the goal also selects its activity, Gym.
    expect(file.tables["day_activity_selections"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          logical_date: date,
          activity_id: "activity-walk",
          selected: 0,
        }),
        expect.objectContaining({
          logical_date: date,
          activity_id: "activity-gym",
          selected: 1,
        }),
      ]),
    );
    expect(file.tables["goal_completions"]).toEqual([
      expect.objectContaining({ logical_date: date, goal_id: "goal-move" }),
    ]);
  });

  test("should record an import and keep a goal with no activity", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const imported = await ownerRequest.post(`${apiOrigin}/api/import`, {
      data: {
        sourceSystem: "daylio",
        sourceSha256: "export-fixture",
        moods: [{ sourceId: "1", name: "good", score: 4 }],
        groups: [{ sourceId: "1", name: "Imported", sortOrder: 0 }],
        activities: [
          { sourceId: "1", groupSourceId: "1", name: "Book", sortOrder: 0 },
        ],
        goals: [
          {
            sourceId: "1",
            activitySourceId: null,
            name: "Unlinked goal",
            scheduleType: "daily",
            sortOrder: 0,
          },
        ],
        entries: [
          {
            sourceId: "1",
            logicalDate: "2026-02-04",
            localTime: "20:00",
            moodSourceId: "1",
            activitySourceIds: ["1"],
          },
        ],
        completions: [
          {
            sourceId: "1",
            goalSourceId: "1",
            logicalDate: "2026-02-04",
            localTime: "20:00:00",
          },
        ],
      },
    });
    expect(imported.status()).toBe(200);

    const file = (await (
      await ownerRequest.get(`${apiOrigin}/api/export`)
    ).json()) as ExportFile;

    expect(file.tables["import_runs"]).toEqual([
      expect.objectContaining({ source_system: "daylio", status: "completed" }),
    ]);
    expect(file.tables["goals"]).toContainEqual(
      expect.objectContaining({ name: "Unlinked goal", activity_id: null }),
    );
    expect(file.tables["entries"]).toEqual([
      expect.objectContaining({ logical_date: "2026-02-04" }),
    ]);
  });
});
