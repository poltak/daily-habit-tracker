import type { APIResponse } from "@playwright/test";
import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";

interface ErrorBody {
  error: { code: string; message: string; issues?: { message: string }[] };
}

/** The texts of the answer that a page can show: the message and each issue. */
async function textsOf(response: APIResponse): Promise<string[]> {
  const { error } = (await response.json()) as ErrorBody;
  return [error.message, ...(error.issues ?? []).map((issue) => issue.message)];
}

test.describe("catalog validation", () => {
  for (const [name, data, text] of [
    [
      "a kind that does not exist",
      { kind: "mood", name: "Sad" },
      "Unsupported catalog item.",
    ],
    ["a group with an empty name", { kind: "group", name: " " }, "required"],
    [
      "an activity with no group",
      { kind: "activity", name: "Yoga" },
      "Choose an activity group.",
    ],
    [
      "an activity in a group that does not exist",
      { kind: "activity", name: "Yoga", groupId: "group-gone" },
      "Choose an activity group.",
    ],
    [
      "an activity with an empty group",
      { kind: "activity", name: "Yoga", groupId: " " },
      "groupId must be a non-empty string.",
    ],
    [
      "an activity with a name that is not text",
      { kind: "activity", name: 5, groupId: "group-health" },
      "name must be a string.",
    ],
    [
      "a goal for an activity that does not exist",
      { kind: "goal", activityId: "activity-gone" },
      "Choose an activity for the goal.",
    ],
    [
      "a goal with a schedule that does not exist",
      { kind: "goal", scheduleType: "monthly" },
      "Choose Daily or Weekly for goal repeat.",
    ],
    [
      "a daily goal with the weekday mask 0",
      { kind: "goal", weekdaysMask: 0 },
      "Daily goals must include at least one weekday.",
    ],
    [
      "a daily goal with a weekday mask above 127",
      { kind: "goal", weekdaysMask: 128 },
      "Daily goals must include at least one weekday.",
    ],
    [
      "a goal with a weekday mask that is not a whole number",
      { kind: "goal", weekdaysMask: 1.5 },
      "weekdaysMask must be an integer.",
    ],
    [
      "a weekly goal with 0 days",
      { kind: "goal", repeatType: "weekly", targetPerWeek: 0 },
      "Weekly goals must target between 1 and 7 days.",
    ],
    [
      "a start date that is not a date",
      { kind: "goal", startDate: "2026-02-30" },
      "Choose a valid goal start date.",
    ],
    [
      "a reminder time that is not a time",
      { kind: "goal", reminderTime: "25:00" },
      "Choose a valid reminder time.",
    ],
    [
      "a reminder flag that is not a boolean",
      { kind: "goal", reminderEnabled: "yes" },
      "reminderEnabled must be a boolean.",
    ],
  ] as const) {
    test(`should refuse a new item with ${name}`, async ({
      ownerRequest,
      apiOrigin,
    }) => {
      const response = await ownerRequest.post(`${apiOrigin}/api/catalog`, {
        data,
      });

      expect(response.status()).toBe(400);
      expect((await textsOf(response)).join(" ")).toContain(text);
    });
  }

  test("should refuse a new item that is not an object", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    for (const data of [[], "group", null]) {
      const response = await ownerRequest.post(`${apiOrigin}/api/catalog`, {
        data,
      });
      expect(response.status(), JSON.stringify(data)).toBe(400);
    }
  });

  for (const [name, path, data, text] of [
    [
      "a field that a group does not have",
      "group/group-work",
      { color: "red" },
      "Unsupported group field: color.",
    ],
    [
      "a field that an activity does not have",
      "activity/activity-gym",
      { reminderTime: "08:30" },
      "Unsupported activity field: reminderTime.",
    ],
    [
      "a field that a goal does not have",
      "goal/goal-read",
      { startDate: "2026-01-01" },
      "Unsupported goal field: startDate.",
    ],
    [
      "a name that is not text",
      "group/group-work",
      { name: 5 },
      "name must be a string.",
    ],
    [
      "a goal with a schedule that does not exist",
      "goal/goal-read",
      { scheduleType: "monthly" },
      "Choose Daily or Weekly for goal repeat.",
    ],
    [
      "a goal with the weekday mask 0",
      "goal/goal-read",
      { repeatType: "daily", weekdaysMask: 0 },
      "Daily goals must include at least one weekday.",
    ],
    [
      "a goal with a weekday mask above 127",
      "goal/goal-read",
      { repeatType: "daily", weekdaysMask: 128 },
      "Daily goals must include at least one weekday.",
    ],
    [
      "a weekly goal with 8 days",
      "goal/goal-read",
      { repeatType: "weekly", targetPerWeek: 8 },
      "Weekly goals must target between 1 and 7 days.",
    ],
    [
      "an activity ID that is empty",
      "goal/goal-read",
      { activityId: "" },
      "activityId must be a non-empty string.",
    ],
    [
      "a reminder time that is not a time",
      "goal/goal-read",
      { reminderTime: "25:00" },
      "Choose a valid reminder time.",
    ],
    [
      "a reminder time that has no leading zero",
      "goal/goal-read",
      { reminderTime: "8:30" },
      "Choose a valid reminder time.",
    ],
    [
      "a reminder time that is not text",
      "goal/goal-read",
      { reminderTime: 830 },
      "reminderTime must be a string.",
    ],
    [
      "a reminder flag that is not a boolean",
      "goal/goal-read",
      { reminderEnabled: "true" },
      "reminderEnabled must be a boolean.",
    ],
    [
      "a body that is not an object",
      "group/group-work",
      [],
      "Catalog changes must be an object.",
    ],
  ] as const) {
    test(`should refuse a change with ${name}, and keep the item`, async ({
      ownerRequest,
      apiOrigin,
    }) => {
      const before = await (
        await ownerRequest.get(`${apiOrigin}/api/catalog`)
      ).json();

      const response = await ownerRequest.patch(
        `${apiOrigin}/api/catalog/${path}`,
        { data },
      );

      expect(response.status()).toBe(400);
      expect((await textsOf(response)).join(" ")).toContain(text);
      expect(
        await (await ownerRequest.get(`${apiOrigin}/api/catalog`)).json(),
      ).toEqual(before);
    });
  }
});

test.describe("goal reminder", () => {
  test("should save the reminder of a goal, and read it back in the catalog", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const goalOf = async () =>
      (
        (await (await ownerRequest.get(`${apiOrigin}/api/catalog`)).json()) as {
          goals: { id: string }[];
        }
      ).goals.find((goal) => goal.id === "goal-read");

    expect(await goalOf()).toMatchObject({ reminderEnabled: false });
    const response = await ownerRequest.patch(
      `${apiOrigin}/api/catalog/goal/goal-read`,
      { data: { reminderEnabled: true, reminderTime: "08:30" } },
    );

    expect(response.status()).toBe(200);
    expect((await response.json()).goal).toMatchObject({
      reminderEnabled: true,
      reminderTime: "08:30",
    });
    expect(await goalOf()).toMatchObject({
      reminderEnabled: true,
      reminderTime: "08:30",
    });
    const off = await ownerRequest.patch(
      `${apiOrigin}/api/catalog/goal/goal-read`,
      { data: { reminderEnabled: false } },
    );
    expect((await off.json()).goal).toMatchObject({
      reminderEnabled: false,
      reminderTime: "08:30",
    });
  });

  test("should save the reminder of a new goal", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const response = await ownerRequest.post(`${apiOrigin}/api/catalog`, {
      data: {
        kind: "goal",
        name: "Stretch",
        reminderEnabled: true,
        reminderTime: "21:05",
      },
    });

    expect(response.status()).toBe(201);
    expect((await response.json()).goal).toMatchObject({
      reminderEnabled: true,
      reminderTime: "21:05",
    });
  });
});
