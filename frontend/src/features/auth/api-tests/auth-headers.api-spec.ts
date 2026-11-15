import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";

test.describe("headers of the sign-in routes", () => {
  test("should not let a cache keep the sign-in state or the passkey list", async ({
    ownerRequest,
    anonymousRequest,
    apiOrigin,
  }) => {
    const status = await anonymousRequest.get(`${apiOrigin}/api/auth/status`);
    const passkeys = await ownerRequest.get(`${apiOrigin}/api/auth/passkeys`);

    expect(status.status()).toBe(200);
    expect(status.headers()["cache-control"]).toBe("no-store");
    expect(passkeys.status()).toBe(200);
    expect(passkeys.headers()["cache-control"]).toBe("no-store");
  });

  test("should clear a session cookie that has no live session", async ({
    anonymousRequest,
    apiOrigin,
  }) => {
    const response = await anonymousRequest.get(`${apiOrigin}/api/entries`, {
      headers: { cookie: "daymark_session=made-up-token-of-a-stale-session" },
    });

    expect(response.status()).toBe(401);
    expect(response.headers()["set-cookie"]).toMatch(
      /^daymark_session=;.*Max-Age=0/,
    );
  });

  test("should not set a cookie when the request has no session cookie", async ({
    anonymousRequest,
    apiOrigin,
  }) => {
    const response = await anonymousRequest.get(`${apiOrigin}/api/entries`);

    expect(response.status()).toBe(401);
    expect(response.headers()["set-cookie"]).toBeUndefined();
  });
});
