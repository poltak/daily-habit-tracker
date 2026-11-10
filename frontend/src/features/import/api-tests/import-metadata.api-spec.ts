import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";

interface Named {
  id: string;
  archived: boolean;
  [field: string]: unknown;
}

/** A backup whose group, activity and goal are archived in Daylio. */
function archivedBackup() {
  return {
    sourceSystem: "daylio",
    sourceSha256: "black-box-metadata",
    moods: [{ sourceId: "m", name: "Good", score: 4 }],
    groups: [
      { sourceId: "g", name: "Imported group", sortOrder: 0, archived: true },
    ],
    activities: [
      {
        sourceId: "a",
        groupSourceId: "g",
        name: "Walk",
        sourceIconId: null,
        sourceState: 0,
        sortOrder: 0,
        archived: true,
      },
    ],
    goals: [
      {
        sourceId: "goal",
        activitySourceId: "a",
        name: "Walk daily",
        scheduleType: "daily",
        sortOrder: 0,
        archived: true,
        reminderEnabled: true,
        reminderTime: "20:00",
      },
    ],
    entries: [
      {
        sourceId: "e",
        logicalDate: "2020-01-01",
        localTime: "20:00",
        timezoneOffsetMinutes: null,
        moodSourceId: "m",
        activitySourceIds: ["a"],
        legacyNote: null,
      },
    ],
    completions: [
      {
        sourceId: "c",
        goalSourceId: "goal",
        logicalDate: "2020-01-01",
        localTime: "20:00:00",
      },
    ],
  };
}

function addDays(date: string, amount: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

test.describe("import metadata", () => {
  test("should keep the archive state of the backup and apply the changes of a repeat import", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const first = archivedBackup();
    first.moods[0]!.name = "Custom good mood";
    const imported = await ownerRequest.post(`${apiOrigin}/api/import`, {
      data: first,
    });
    expect(imported.status()).toBe(200);
    const { bootstrap } = (await imported.json()) as {
      bootstrap: {
        moods: unknown[];
        groups: Named[];
        activities: Named[];
        goals: Named[];
      };
    };
    expect(bootstrap.moods).toHaveLength(5);
    expect(
      bootstrap.groups.find((item) => item.id === "daylio-group-g")?.archived,
    ).toBe(true);
    expect(
      bootstrap.activities.find((item) => item.id === "daylio-activity-a")
        ?.archived,
    ).toBe(true);
    expect(
      bootstrap.goals.find((item) => item.id === "daylio-goal-goal")?.archived,
    ).toBe(true);

    const second = archivedBackup();
    second.groups[0]!.archived = false;
    second.activities[0]!.archived = false;
    Object.assign(second.activities[0]!, { sourceIconId: "favorite" });
    Object.assign(second.goals[0]!, {
      archived: false,
      sortOrder: 8,
      reminderEnabled: false,
      reminderTime: "21:00",
    });
    Object.assign(second.entries[0]!, { legacyNote: "Updated import note" });
    const repeated = await ownerRequest.post(`${apiOrigin}/api/import`, {
      data: second,
    });

    expect(repeated.status()).toBe(200);
    const again = (await repeated.json()) as { bootstrap: typeof bootstrap };
    const groups = again.bootstrap.groups.filter(
      (item) => item.id === "daylio-group-g",
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.archived).toBe(false);
    expect(
      again.bootstrap.activities.find(
        (item) => item.id === "daylio-activity-a",
      ),
    ).toMatchObject({ archived: false, sourceIconId: "favorite" });
    expect(
      again.bootstrap.goals.find((item) => item.id === "daylio-goal-goal"),
    ).toMatchObject({
      archived: false,
      sortOrder: 8,
      reminderEnabled: false,
      reminderTime: "21:00",
    });
    const entry = await (
      await ownerRequest.get(`${apiOrigin}/api/entries/2020-01-01`)
    ).json();
    expect(entry.entry).toMatchObject({
      version: 2,
      legacyNote: "Updated import note",
    });
    const stale = await ownerRequest.put(
      `${apiOrigin}/api/entries/2020-01-01`,
      {
        data: {
          moodId: entry.entry.moodId,
          activityIds: entry.entry.activityIds,
          completedGoalIds: [],
          expectedVersion: 1,
        },
      },
    );
    expect(stale.status()).toBe(409);
  });

  test("should import a backup of several hundred days in one request", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const backup = archivedBackup();
    backup.entries = Array.from({ length: 450 }, (_, index) => ({
      sourceId: `e-${index}`,
      logicalDate: addDays("2020-01-01", index),
      localTime: "20:00",
      timezoneOffsetMinutes: null,
      moodSourceId: "m",
      activitySourceIds: ["a", "a"],
      legacyNote: null,
    }));
    backup.completions = [];

    const response = await ownerRequest.post(`${apiOrigin}/api/import`, {
      data: backup,
    });

    expect(response.status()).toBe(200);
    const list = await (
      await ownerRequest.get(`${apiOrigin}/api/entries?limit=100&offset=400`)
    ).json();
    expect(list.entries).toHaveLength(50);
    expect(list.hasMore).toBe(false);
    expect(list.entries[0]).toMatchObject({
      logicalDate: addDays("2020-01-01", 49),
      activityIds: ["daylio-activity-a"],
    });
  });
});
