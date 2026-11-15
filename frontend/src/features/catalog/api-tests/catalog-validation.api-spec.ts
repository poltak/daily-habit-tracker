import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";

test.describe("goal reminder", () => {
  test("should save the reminder of a goal, and of a new goal, and read it back in the catalog", async ({
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

    const created = await ownerRequest.post(`${apiOrigin}/api/catalog`, {
      data: {
        kind: "goal",
        name: "Stretch",
        reminderEnabled: true,
        reminderTime: "21:05",
      },
    });
    expect(created.status()).toBe(201);
    expect((await created.json()).goal).toMatchObject({
      reminderEnabled: true,
      reminderTime: "21:05",
    });
  });
});
