import type { APIRequestContext, APIResponse } from "@playwright/test";

interface RawToolResult {
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    additionalProperties?: boolean;
    required?: string[];
    properties: Record<string, { description?: string }>;
  };
  annotations: { readOnlyHint?: boolean };
}

/**
 * What a tool gives back. Daymark's tools answer with one text block: JSON
 * when the tool worked, and a message for the agent when it refused.
 */
export interface ToolResult {
  isError: boolean;
  /** The text block, as the agent reads it. */
  text: string;
  /** The text block as JSON. It is `null` when the tool refused. */
  data: unknown;
}

/** An MCP client over streamable HTTP, as Claude connects to `/api/mcp`. */
export class McpClient {
  private nextId = 1;
  /** The protocol version that `initialize` agreed, sent with each later request. */
  private protocolVersion: string | null = null;

  constructor(
    private readonly input: {
      request: APIRequestContext;
      origin: string;
      accessToken: string | null;
    },
  ) {}

  /** Send one JSON-RPC request, and return the raw answer. */
  async send(method: string, params: unknown = {}): Promise<APIResponse> {
    const headers: Record<string, string> = {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    };
    if (this.protocolVersion !== null) {
      headers["mcp-protocol-version"] = this.protocolVersion;
    }
    if (this.input.accessToken !== null) {
      headers["authorization"] = `Bearer ${this.input.accessToken}`;
    }
    return this.input.request.post(`${this.input.origin}/api/mcp`, {
      headers,
      data: { jsonrpc: "2.0", id: this.nextId++, method, params },
    });
  }

  /**
   * Send a request that is not one JSON-RPC message, such as a body that is
   * not JSON, a batch, or a wrong content type. It carries the token.
   */
  async sendRaw(input: {
    method?: "GET" | "POST" | "DELETE";
    headers?: Record<string, string>;
    data?: unknown;
  }): Promise<APIResponse> {
    const headers = { ...input.headers };
    if (this.input.accessToken !== null) {
      headers["authorization"] = `Bearer ${this.input.accessToken}`;
    }
    return this.input.request.fetch(`${this.input.origin}/api/mcp`, {
      method: input.method ?? "POST",
      headers,
      data: input.data,
    });
  }

  /** Agree on a protocol version, as each MCP client does first. */
  async initialize(): Promise<void> {
    const result = await this.result<{ protocolVersion: string }>(
      "initialize",
      {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "black-box-agent", version: "1.0.0" },
      },
    );
    this.protocolVersion = result.protocolVersion;
  }

  async listTools(): Promise<Tool[]> {
    const body = await this.result<{ tools: Tool[] }>("tools/list");
    return body.tools;
  }

  /** Call a tool, and return its result. A tool error is a result too. */
  async callTool(name: string, args: unknown): Promise<ToolResult> {
    const raw = await this.result<RawToolResult>("tools/call", {
      name,
      arguments: args,
    });
    const text = raw.content?.[0]?.text ?? "";
    const isError = raw.isError ?? false;
    return { isError, text, data: isError ? null : JSON.parse(text) };
  }

  private async result<T>(method: string, params: unknown = {}): Promise<T> {
    const response = await this.send(method, params);
    if (!response.ok()) {
      throw new Error(
        `MCP ${method} failed: ${response.status()} ${await response.text()}`,
      );
    }
    const body = (await response.json()) as {
      result?: T;
      error?: { message: string };
    };
    if (body.error || body.result === undefined) {
      throw new Error(`MCP ${method} failed: ${body.error?.message}`);
    }
    return body.result;
  }
}
