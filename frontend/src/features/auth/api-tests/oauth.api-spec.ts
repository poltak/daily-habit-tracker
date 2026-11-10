import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";
import { McpClient } from "../../core/api-tests/mcp-client.js";
import {
  authorizeWithOAuth,
  exchangeOAuthCode,
} from "../../core/api-tests/oauth-client.js";

test.describe("OAuth clients", () => {
  test("should publish both discovery documents to any origin", async ({
    anonymousRequest,
    apiOrigin,
  }) => {
    const resource = await anonymousRequest.get(
      `${apiOrigin}/.well-known/oauth-protected-resource/api/mcp`,
    );
    expect(resource.status()).toBe(200);
    expect(resource.headers()["content-type"]).toContain("application/json");
    expect(resource.headers()["access-control-allow-origin"]).toBe("*");
    expect(await resource.json()).toEqual({
      resource: `${apiOrigin}/api/mcp`,
      authorization_servers: [apiOrigin],
      bearer_methods_supported: ["header"],
      resource_name: "daymark",
    });
    const root = await anonymousRequest.get(
      `${apiOrigin}/.well-known/oauth-protected-resource`,
    );
    expect(await root.json()).toMatchObject({
      resource: `${apiOrigin}/api/mcp`,
    });

    const server = await anonymousRequest.get(
      `${apiOrigin}/.well-known/oauth-authorization-server`,
    );
    expect(server.status()).toBe(200);
    expect(await server.json()).toMatchObject({
      issuer: apiOrigin,
      authorization_endpoint: `${apiOrigin}/oauth/authorize`,
      token_endpoint: `${apiOrigin}/oauth/token`,
      registration_endpoint: `${apiOrigin}/oauth/register`,
      code_challenge_methods_supported: ["S256"],
      authorization_response_iss_parameter_supported: true,
    });
  });

  test("should register a client, and refuse an invalid redirect address", async ({
    anonymousRequest,
    apiOrigin,
  }) => {
    const registered = await anonymousRequest.post(
      `${apiOrigin}/oauth/register`,
      {
        data: {
          client_name: "Claude Code",
          redirect_uris: ["http://localhost:54212/callback"],
          token_endpoint_auth_method: "none",
        },
      },
    );
    expect(registered.status()).toBe(201);
    const client = await registered.json();
    expect(client).toMatchObject({
      client_name: "Claude Code",
      token_endpoint_auth_method: "none",
    });
    expect(client.client_secret).toBeUndefined();

    const confidential = await anonymousRequest.post(
      `${apiOrigin}/oauth/register`,
      {
        data: {
          client_name: "Agent",
          redirect_uris: ["https://agent.example/callback"],
        },
      },
    );
    const secret = await confidential.json();
    expect(secret.token_endpoint_auth_method).toBe("client_secret_basic");
    expect(secret.client_secret).toEqual(expect.any(String));

    for (const redirect of [
      "javascript:alert(1)",
      "http://evil.example/callback",
      "https://agent.example/callback#fragment",
    ]) {
      const invalid = await anonymousRequest.post(
        `${apiOrigin}/oauth/register`,
        { data: { client_name: "Invalid app", redirect_uris: [redirect] } },
      );
      expect(invalid.status(), redirect).toBe(400);
      expect(await invalid.json()).toMatchObject({
        error: "invalid_redirect_uri",
      });
    }
  });

  test("should return access_denied when the owner denies consent", async ({
    anonymousRequest,
    ownerPage,
    apiOrigin,
  }) => {
    const authorization = await authorizeWithOAuth({
      request: anonymousRequest,
      page: ownerPage,
      origin: apiOrigin,
      clientName: "Denied app",
      approve: async () => {
        await ownerPage
          .getByRole("button", { name: "Deny", exact: true })
          .click();
      },
    });
    expect(authorization.callback.searchParams.get("error")).toBe(
      "access_denied",
    );
    expect(authorization.callback.searchParams.get("code")).toBeNull();
    expect(authorization.callback.searchParams.get("iss")).toBe(apiOrigin);
  });

  test("should refuse a wrong verifier and a used code, and accept a refresh token", async ({
    anonymousRequest,
    ownerPage,
    apiOrigin,
  }) => {
    const options = {
      request: anonymousRequest,
      page: ownerPage,
      origin: apiOrigin,
      clientName: "Refresh app",
      approve: async () => {
        await ownerPage
          .getByRole("button", { name: "Allow", exact: true })
          .click();
      },
    };
    const wrong = await authorizeWithOAuth(options);
    const refused = await exchangeOAuthCode({
      request: anonymousRequest,
      authorization: wrong,
      verifier: "a".repeat(43),
    });
    expect(refused.status()).toBe(400);
    expect(await refused.json()).toMatchObject({ error: "invalid_grant" });

    const authorization = await authorizeWithOAuth(options);
    expect(authorization.callback.searchParams.get("iss")).toBe(apiOrigin);
    const response = await exchangeOAuthCode({
      request: anonymousRequest,
      authorization,
    });
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");
    const tokens = await response.json();
    expect(tokens).toMatchObject({
      access_token: expect.any(String),
      refresh_token: expect.any(String),
      token_type: "Bearer",
      expires_in: 3600,
    });
    const reused = await exchangeOAuthCode({
      request: anonymousRequest,
      authorization,
    });
    expect(reused.status()).toBe(400);
    expect(await reused.json()).toMatchObject({ error: "invalid_grant" });

    const refresh = await anonymousRequest.post(`${apiOrigin}/oauth/token`, {
      form: {
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
        client_id: authorization.clientId,
      },
    });
    expect(refresh.status()).toBe(200);
    const renewed = await refresh.json();
    expect(renewed.access_token).not.toBe(tokens.access_token);
    expect(renewed.refresh_token).not.toBe(tokens.refresh_token);
    const client = new McpClient({
      request: anonymousRequest,
      origin: apiOrigin,
      accessToken: renewed.access_token,
    });
    await client.initialize();
    expect((await client.send("tools/list")).status()).toBe(200);

    const unsupported = await anonymousRequest.post(
      `${apiOrigin}/oauth/token`,
      {
        form: {
          grant_type: "client_credentials",
          client_id: authorization.clientId,
        },
      },
    );
    expect(unsupported.status()).toBe(400);
    expect(await unsupported.json()).toMatchObject({
      error: "unsupported_grant_type",
    });
  });

  test("should challenge an invalid token and a missing token", async ({
    anonymousRequest,
    apiOrigin,
  }) => {
    const invalid = await new McpClient({
      request: anonymousRequest,
      origin: apiOrigin,
      accessToken: "invalid-token",
    }).send("tools/list");
    expect(invalid.status()).toBe(401);
    expect(invalid.headers()["www-authenticate"]).toContain(
      'error="invalid_token"',
    );

    const missing = await new McpClient({
      request: anonymousRequest,
      origin: apiOrigin,
      accessToken: null,
    }).send("tools/list");
    expect(missing.status()).toBe(401);
    expect(missing.headers()["www-authenticate"]).toBe(
      `Bearer resource_metadata="${apiOrigin}/.well-known/oauth-protected-resource/api/mcp"`,
    );
  });
});
