import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";
import {
  authorizeWithOAuth,
  exchangeOAuthCode,
} from "../../core/api-tests/oauth-client.js";

const CHALLENGE = "a".repeat(43);
const REDIRECT = "https://agent.example/callback";

test.describe("OAuth consent", () => {
  test("should send a visitor without a session to sign in and back", async ({
    anonymousRequest,
    apiOrigin,
  }) => {
    const client = await (
      await anonymousRequest.post(`${apiOrigin}/oauth/register`, {
        data: { redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" },
      })
    ).json();
    const query = new URLSearchParams({
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: REDIRECT,
      code_challenge: CHALLENGE,
      code_challenge_method: "S256",
      state: "state-123",
    }).toString();

    const response = await anonymousRequest.get(
      `${apiOrigin}/oauth/authorize?${query}`,
      { maxRedirects: 0 },
    );

    expect(response.status()).toBe(303);
    const location = new URL(response.headers()["location"] ?? "", apiOrigin);
    expect(location.pathname).toBe("/sign-in");
    expect(location.searchParams.get("returnTo")).toBe(
      `/oauth/authorize?${query}`,
    );
  });

  test("should show the owner the app, its host and a page that no frame can hold", async ({
    ownerRequest,
    anonymousRequest,
    apiOrigin,
  }) => {
    const client = await (
      await anonymousRequest.post(`${apiOrigin}/oauth/register`, {
        data: {
          client_name: "Claude Code",
          redirect_uris: [REDIRECT],
          token_endpoint_auth_method: "none",
        },
      })
    ).json();
    const query = new URLSearchParams({
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: REDIRECT,
      code_challenge: CHALLENGE,
      code_challenge_method: "S256",
    }).toString();

    const consent = await ownerRequest.get(
      `${apiOrigin}/oauth/authorize?${query}`,
    );

    expect(consent.status()).toBe(200);
    expect(consent.headers()["x-frame-options"]).toBe("DENY");
    expect(consent.headers()["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(consent.headers()["referrer-policy"]).toBe("same-origin");
    const html = await consent.text();
    expect(html).toContain("Connect Claude Code to daymark?");
    expect(html).toContain("<strong>agent.example</strong>");

    const crossSite = await ownerRequest.post(`${apiOrigin}/oauth/authorize`, {
      headers: { origin: "https://evil.example" },
      form: {
        response_type: "code",
        client_id: client.client_id,
        redirect_uri: REDIRECT,
        code_challenge: CHALLENGE,
        code_challenge_method: "S256",
        decision: "allow",
      },
    });
    expect(crossSite.status()).toBe(403);
  });

  test("should show an error on its own page, and never redirect, for a bad request", async ({
    ownerRequest,
    anonymousRequest,
    apiOrigin,
  }) => {
    const client = await (
      await anonymousRequest.post(`${apiOrigin}/oauth/register`, {
        data: { redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" },
      })
    ).json();
    const base = {
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: REDIRECT,
      code_challenge: CHALLENGE,
      code_challenge_method: "S256",
    };
    const cases: Array<[Record<string, string>, string]> = [
      [{ redirect_uri: "https://evil.example/cb" }, "did not register"],
      [{ client_id: "dmc_unknown" }, "not registered"],
      [{ code_challenge_method: "plain" }, "did not use PKCE"],
      [{ response_type: "token" }, "unsupported response type"],
      [{ resource: "https://other.example/api/mcp" }, "another resource"],
    ];

    for (const [change, message] of cases) {
      const query = new URLSearchParams({ ...base, ...change }).toString();
      for (const request of [ownerRequest, anonymousRequest]) {
        const response = await request.get(
          `${apiOrigin}/oauth/authorize?${query}`,
          { maxRedirects: 0 },
        );
        expect(response.status(), message).toBe(400);
        expect(response.headers()["location"]).toBeUndefined();
        expect(await response.text()).toContain(message);
      }
    }
  });

  test("should keep the refresh token of a client with a secret, and refuse a wrong secret", async ({
    anonymousRequest,
    ownerPage,
    apiOrigin,
  }) => {
    const authorization = await authorizeWithOAuth({
      request: anonymousRequest,
      page: ownerPage,
      origin: apiOrigin,
      clientName: "Secret app",
      authMethod: "client_secret_post",
      approve: async () => {
        await ownerPage
          .getByRole("button", { name: "Allow", exact: true })
          .click();
      },
    });
    const tokens = await (
      await exchangeOAuthCode({ request: anonymousRequest, authorization })
    ).json();
    const refresh = (secret: string) =>
      anonymousRequest.post(`${apiOrigin}/oauth/token`, {
        form: {
          grant_type: "refresh_token",
          refresh_token: tokens.refresh_token,
          client_id: authorization.clientId,
          client_secret: secret,
        },
      });

    const renewed = await refresh(authorization.clientSecret ?? "");
    expect(renewed.status()).toBe(200);
    const body = await renewed.json();
    expect(body.refresh_token).toBe(tokens.refresh_token);
    expect(body.access_token).not.toBe(tokens.access_token);

    const wrong = await refresh("dms_wrong");
    expect(wrong.status()).toBe(401);
    expect(await wrong.json()).toMatchObject({ error: "invalid_client" });
  });

  test("should limit the registrations from one network", async ({
    anonymousRequest,
    apiOrigin,
  }) => {
    const register = () =>
      anonymousRequest.post(`${apiOrigin}/oauth/register`, {
        data: { redirect_uris: ["https://spam.example/cb"] },
      });

    for (let count = 0; count < 10; count += 1) {
      expect((await register()).status()).toBe(201);
    }

    const limited = await register();
    expect(limited.status()).toBe(429);
    expect(await limited.json()).toMatchObject({
      error: "temporarily_unavailable",
    });
  });
});
