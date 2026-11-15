import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";

const API_ROUTES: Array<{ method: "GET" | "PUT" | "POST"; path: string }> = [
  { method: "GET", path: "/api/health" },
  { method: "GET", path: "/api/bootstrap" },
  { method: "GET", path: "/api/calendar?month=2026-01" },
  { method: "GET", path: "/api/entries" },
  { method: "GET", path: "/api/entries/2026-01-05" },
  { method: "GET", path: "/api/export" },
  { method: "GET", path: "/api/insights" },
  { method: "GET", path: "/api/settings" },
  { method: "GET", path: "/api/goals/goal-move/history" },
  { method: "POST", path: "/api/import" },
  { method: "POST", path: "/api/catalog" },
  { method: "PUT", path: "/api/entries/2026-01-05" },
];

test.describe("access to the API", () => {
  test("should refuse each route to a client without a session", async ({
    anonymousRequest,
    apiOrigin,
  }) => {
    for (const { method, path } of API_ROUTES) {
      const response = await anonymousRequest.fetch(`${apiOrigin}${path}`, {
        method,
        ...(method === "GET"
          ? {}
          : { headers: { origin: apiOrigin }, data: {} }),
      });
      expect(response.status(), `${method} ${path}`).toBe(401);
    }
  });

  test("should answer the health check of a signed-in owner", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const response = await ownerRequest.get(`${apiOrigin}/api/health`);

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test("should refuse a write that comes from another site", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const response = await ownerRequest.post(`${apiOrigin}/api/import`, {
      headers: { origin: "https://evil.example" },
      data: {},
    });

    expect(response.status()).toBe(403);
  });

  test("should refuse the session of the owner on the MCP endpoint", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const response = await ownerRequest.post(`${apiOrigin}/api/mcp`, {
      data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    });

    expect(response.status()).toBe(401);
    expect(response.headers()["www-authenticate"]).toContain(
      `resource_metadata="${apiOrigin}/.well-known/oauth-protected-resource/api/mcp"`,
    );
  });

  test("should refuse the owner's session after sign-out", async ({
    ownerRequest,
    apiOrigin,
  }) => {
    const signOut = await ownerRequest.post(`${apiOrigin}/api/auth/logout`);
    expect(signOut.status()).toBe(200);

    const response = await ownerRequest.get(`${apiOrigin}/api/bootstrap`);

    expect(response.status()).toBe(401);
  });
});
