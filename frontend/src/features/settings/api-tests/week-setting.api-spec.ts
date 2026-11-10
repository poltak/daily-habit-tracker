import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";

test.describe("week setting", () => {
  test("should save the day on which the week ends, and answer with the settings", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const response = await ownerRequest.patch(`${apiOrigin}/api/settings`, {
      data: { weekEndsOn: 3 },
    });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ settings: { weekEndsOn: 3 } });
  });

  for (const [name, data] of [
    ["a day that is not a weekday", { weekEndsOn: 7 }],
    ["a day that is not a whole number", { weekEndsOn: 2.5 }],
    ["a day that is a text", { weekEndsOn: "3" }],
    ["a setting that does not exist", { timezone: "UTC" }],
  ] as const) {
    test(`should refuse ${name}`, async ({ ownerRequest, apiOrigin }) => {
      await ownerRequest.patch(`${apiOrigin}/api/settings`, {
        data: { weekEndsOn: 5 },
      });

      const response = await ownerRequest.patch(`${apiOrigin}/api/settings`, {
        data,
      });

      expect(response.status()).toBe(400);
      const kept = await ownerRequest.patch(`${apiOrigin}/api/settings`, {
        data: {},
      });
      expect(await kept.json()).toEqual({ settings: { weekEndsOn: 5 } });
    });
  }
});
