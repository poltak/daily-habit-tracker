import { expect } from "@playwright/test";
import { test } from "./api-test.js";

test.describe("public files", () => {
  test("should serve the pages and the app files without a session", async ({
    anonymousRequest,
    apiOrigin,
  }) => {
    for (const path of ["/", "/sign-in", "/manifest.webmanifest"]) {
      const response = await anonymousRequest.get(`${apiOrigin}${path}`);
      expect(response.status(), path).toBe(200);
    }
  });

  test("should describe the app as an installable one", async ({
    anonymousRequest,
    apiOrigin,
  }) => {
    const response = await anonymousRequest.get(
      `${apiOrigin}/manifest.webmanifest`,
    );

    expect(await response.json()).toMatchObject({
      name: expect.any(String),
      icons: expect.arrayContaining([
        expect.objectContaining({ sizes: "192x192" }),
        expect.objectContaining({ sizes: "512x512" }),
      ]),
    });
  });

  test("should answer an unknown page with a 404", async ({
    anonymousRequest,
    apiOrigin,
  }) => {
    const response = await anonymousRequest.get(`${apiOrigin}/no-such-page`);

    expect(response.status()).toBe(404);
    expect(response.headers()["content-type"]).toContain("text/html");
  });
});
