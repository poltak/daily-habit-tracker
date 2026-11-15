import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";

test.describe("passkey options", () => {
  test("should give a challenge that is new each time", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const ask = async () =>
      (
        await ownerRequest.post(`${apiOrigin}/api/auth/register/options`, {
          data: {},
        })
      ).json();

    const [first, second] = [await ask(), await ask()];

    expect(first.options.challenge).not.toBe(second.options.challenge);
    expect(first.challengeId).not.toBe(second.challengeId);
  });

  test("should give a client with no session the registration options for the right setup code only", async ({
    anonymousRequest,
    apiOrigin,
    setupCode,
  }) => {
    const ask = (data: unknown) =>
      anonymousRequest.post(`${apiOrigin}/api/auth/register/options`, {
        headers: { origin: apiOrigin },
        data,
      });

    const wrong = await ask({ setupCode: "not the setup code" });
    const missing = await ask({});
    const right = await ask({ setupCode });

    expect(wrong.status()).toBe(403);
    expect((await wrong.json()).error.code).toBe("INVALID_SETUP_CODE");
    expect(missing.status()).toBe(403);
    expect(right.status()).toBe(200);
    expect((await right.json()).options).toMatchObject({
      challenge: expect.any(String),
      excludeCredentials: [],
    });
  });

  test("should refuse the sign-in options while no passkey exists", async ({
    anonymousRequest,
    apiOrigin,
  }) => {
    const response = await anonymousRequest.post(
      `${apiOrigin}/api/auth/login/options`,
      { headers: { origin: apiOrigin } },
    );

    expect(response.status()).toBe(409);
    expect((await response.json()).error.code).toBe("SETUP_REQUIRED");
  });

  test("should give a client with no session the sign-in options of a journal that has a passkey", async ({
    ownerPage,
    anonymousRequest,
    apiOrigin,
  }) => {
    void ownerPage;

    const response = await anonymousRequest.post(
      `${apiOrigin}/api/auth/login/options`,
      { headers: { origin: apiOrigin } },
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.challengeId).toMatch(/^[A-Za-z0-9_-]{20,100}$/);
    expect(body.options).toMatchObject({
      challenge: expect.any(String),
      rpId: new URL(apiOrigin).hostname,
      userVerification: "required",
    });
  });

  test("should refuse an answer for a challenge that never existed", async ({
    anonymousRequest,
    apiOrigin,
  }) => {
    const response = await anonymousRequest.post(
      `${apiOrigin}/api/auth/login/verify`,
      {
        headers: { origin: apiOrigin },
        data: {
          challengeId: "a".repeat(30),
          response: { id: "passkey-gone" },
        },
      },
    );

    expect(response.status()).toBe(400);
    expect(response.headers()["set-cookie"]).toBeUndefined();
  });
});

test.describe("setup code limit", () => {
  test("should answer 429 after ten wrong codes from one network, also for the right code", async ({
    anonymousRequest,
    apiOrigin,
    setupCode,
  }) => {
    const ask = (code: string) =>
      anonymousRequest.post(`${apiOrigin}/api/auth/register/options`, {
        headers: { origin: apiOrigin },
        data: { setupCode: code },
      });

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const wrong = await ask(`wrong code ${attempt}`);
      expect(wrong.status(), `wrong code ${attempt}`).toBe(403);
    }
    const eleventh = await ask("wrong code 11");
    const right = await ask(setupCode);

    expect(eleventh.status()).toBe(429);
    expect((await eleventh.json()).error).toEqual({
      code: "RATE_LIMITED",
      message: "Too many wrong setup codes. Wait 15 minutes, then try again.",
    });
    expect(right.status()).toBe(429);
  });
});
