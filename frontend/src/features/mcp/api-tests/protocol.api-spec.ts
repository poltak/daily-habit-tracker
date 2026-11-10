import { expect } from "@playwright/test";
import { test } from "../../core/api-tests/api-test.js";

const JSON_HEADERS = { "content-type": "application/json" };
const TOOLS = [
  "get_overview",
  "get_days",
  "summarize_mood",
  "summarize_activities",
  "get_goal_history",
  "save_day",
];

test.describe("MCP protocol", () => {
  test("should agree on a protocol version and describe the server", async ({
    agent,
  }) => {
    for (const version of ["2025-06-18", "2025-03-26", "2024-11-05"]) {
      const response = await agent.send("initialize", {
        protocolVersion: version,
        capabilities: {},
        clientInfo: { name: "black-box-agent", version: "1.0.0" },
      });
      expect((await response.json()).result.protocolVersion).toBe(version);
    }

    const future = await (
      await agent.send("initialize", { protocolVersion: "2099-01-01" })
    ).json();

    expect(future.result.protocolVersion).toBe("2025-06-18");
    expect(future.result.capabilities).toEqual({
      tools: { listChanged: false },
    });
    expect(future.result.serverInfo).toMatchObject({ name: "daymark" });
    expect(future.result.instructions).toContain("get_overview first");
    expect(await (await agent.send("ping")).json()).toMatchObject({
      result: {},
    });
  });

  test("should list six tools with strict input schemas", async ({ agent }) => {
    const tools = await agent.listTools();

    expect(tools.map((tool) => tool.name)).toEqual(TOOLS);
    for (const tool of tools) {
      expect(tool.inputSchema.type, tool.name).toBe("object");
      expect(tool.inputSchema.additionalProperties, tool.name).toBe(false);
      expect(tool.description.length, tool.name).toBeGreaterThan(60);
      for (const [name, property] of Object.entries(
        tool.inputSchema.properties,
      )) {
        expect(property.description, `${tool.name}.${name}`).toBeTruthy();
      }
      expect(tool.annotations.readOnlyHint, tool.name).toBe(
        tool.name !== "save_day",
      );
    }
    expect(
      tools.find((tool) => tool.name === "save_day")?.inputSchema.required,
    ).toEqual(["date", "mood", "activities"]);
  });

  test("should answer a bad message with a JSON-RPC error", async ({
    agent,
  }) => {
    const unknownMethod = await (await agent.send("resources/list")).json();
    expect(unknownMethod.error.code).toBe(-32601);

    const unknownTool = await (
      await agent.send("tools/call", { name: "drop_everything" })
    ).json();
    expect(unknownTool.error.code).toBe(-32602);

    const noVersion = await agent.sendRaw({
      headers: JSON_HEADERS,
      data: { id: 1, method: "ping" },
    });
    expect((await noVersion.json()).error.code).toBe(-32600);
  });

  test("should give a notification no reply, and answer a batch in order", async ({
    agent,
  }) => {
    const notification = await agent.sendRaw({
      headers: JSON_HEADERS,
      data: { jsonrpc: "2.0", method: "notifications/initialized" },
    });
    expect(notification.status()).toBe(202);
    expect(await notification.text()).toBe("");

    const batch = await agent.sendRaw({
      headers: JSON_HEADERS,
      data: [
        { jsonrpc: "2.0", id: 1, method: "ping" },
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { jsonrpc: "2.0", id: 2, method: "ping" },
      ],
    });
    expect(batch.status()).toBe(200);
    const replies = (await batch.json()) as Array<{ id: number }>;
    expect(replies.map((reply) => reply.id)).toEqual([1, 2]);

    const empty = await agent.sendRaw({ headers: JSON_HEADERS, data: [] });
    expect(empty.status()).toBe(400);
  });

  test("should refuse a request that is not a same-origin JSON post", async ({
    agent,
    apiOrigin,
  }) => {
    const ping = { jsonrpc: "2.0", id: 1, method: "ping" };

    const sameOrigin = await agent.sendRaw({
      headers: { ...JSON_HEADERS, origin: apiOrigin },
      data: ping,
    });
    expect(sameOrigin.status()).toBe(200);
    expect(sameOrigin.headers()["content-type"]).toContain("application/json");

    const otherSite = await agent.sendRaw({
      headers: { ...JSON_HEADERS, origin: "https://evil.example" },
      data: ping,
    });
    expect(otherSite.status()).toBe(403);

    const text = await agent.sendRaw({
      headers: { "content-type": "text/plain" },
      data: "{}",
    });
    expect(text.status()).toBe(415);

    const oldVersion = await agent.sendRaw({
      headers: { ...JSON_HEADERS, "mcp-protocol-version": "1999-01-01" },
      data: ping,
    });
    expect(oldVersion.status()).toBe(400);

    const malformed = await agent.sendRaw({
      headers: JSON_HEADERS,
      data: Buffer.from("{not json"),
    });
    expect(malformed.status()).toBe(400);
    expect((await malformed.json()).error.code).toBe(-32700);

    const get = await agent.sendRaw({ method: "GET" });
    expect(get.status()).toBe(405);
    expect(get.headers()["allow"]).toBe("POST");
  });
});
