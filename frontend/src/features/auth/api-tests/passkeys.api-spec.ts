import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";

interface Passkey {
  id: string;
  name: string;
  createdAt: number;
  lastUsedAt: number | null;
  synced: boolean;
  current: boolean;
}

test.describe("passkey list and removal", () => {
  test("should list the passkey that signed in, and mark it as the current one", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const response = await ownerRequest.get(`${apiOrigin}/api/auth/passkeys`);

    expect(response.status()).toBe(200);
    const { passkeys } = (await response.json()) as { passkeys: Passkey[] };
    expect(passkeys).toHaveLength(1);
    expect(passkeys[0]).toEqual({
      id: expect.any(String),
      name: expect.any(String),
      createdAt: expect.any(Number),
      lastUsedAt: null,
      synced: expect.any(Boolean),
      current: true,
    });
  });

  test("should answer NOT_FOUND for a passkey that does not exist", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const response = await ownerRequest.delete(
      `${apiOrigin}/api/auth/passkeys/passkey-gone`,
    );

    expect(response.status()).toBe(404);
    expect((await response.json()).error.code).toBe("NOT_FOUND");
  });

  test("should keep the last passkey, and the session of the owner", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const { passkeys } = (await (
      await ownerRequest.get(`${apiOrigin}/api/auth/passkeys`)
    ).json()) as { passkeys: Passkey[] };

    const response = await ownerRequest.delete(
      `${apiOrigin}/api/auth/passkeys/${encodeURIComponent(passkeys[0]?.id ?? "")}`,
    );

    expect(response.status()).toBe(409);
    expect((await response.json()).error.code).toBe("LAST_PASSKEY");
    expect(response.headers()["set-cookie"]).toBeUndefined();
    const after = await ownerRequest.get(`${apiOrigin}/api/auth/passkeys`);
    expect(after.status()).toBe(200);
    expect((await after.json()).passkeys).toHaveLength(1);
  });

  test("should give a client with no session neither the list nor the removal", async ({
    anonymousRequest,
    apiOrigin,
  }) => {
    const list = await anonymousRequest.get(`${apiOrigin}/api/auth/passkeys`);
    const removal = await anonymousRequest.delete(
      `${apiOrigin}/api/auth/passkeys/passkey-gone`,
      { headers: { origin: apiOrigin } },
    );

    expect(list.status()).toBe(401);
    expect(removal.status()).toBe(401);
  });
});

test.describe("passkey options", () => {
  test("should give a signed-in owner the options to add a passkey, with no setup code", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const { passkeys } = (await (
      await ownerRequest.get(`${apiOrigin}/api/auth/passkeys`)
    ).json()) as { passkeys: Passkey[] };

    const response = await ownerRequest.post(
      `${apiOrigin}/api/auth/register/options`,
      { data: {} },
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.challengeId).toMatch(/^[A-Za-z0-9_-]{20,100}$/);
    expect(body.options).toMatchObject({
      challenge: expect.any(String),
      rp: { id: new URL(apiOrigin).hostname, name: expect.any(String) },
      user: {
        id: expect.any(String),
        name: expect.any(String),
        displayName: expect.any(String),
      },
      pubKeyCredParams: expect.arrayContaining([
        { alg: -7, type: "public-key" },
      ]),
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
      excludeCredentials: [{ id: passkeys[0]?.id, type: "public-key" }],
    });
  });

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
