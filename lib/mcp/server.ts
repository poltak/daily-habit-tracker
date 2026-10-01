// A stateless Model Context Protocol server over Streamable HTTP. Each POST carries one
// JSON-RPC message and gets a plain JSON reply, so it needs no sessions, streams or
// dependencies and runs in the same Worker as the rest of the API.
import { MCP_TOOLS, checkArguments, type JournalStore } from "./tools.ts";

export const MCP_SERVER_INFO = { name: "daymark", title: "Daymark journal", version: "1.0.0" };
/** Newest first. The server answers with the client's version when it knows it, and otherwise with the newest. */
export const MCP_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const INSTRUCTIONS = [
  "Daymark is a personal daily journal. It holds one entry per calendar day: a mood scored from 1 (worst) to 5 (best), the activities done that day, and the goals completed.",
  "Call get_overview first to learn the moods, activities, goals and how much history exists.",
  "To analyse long periods, use summarize_mood and summarize_activities, which cover any span in one call. Use get_days for day-level detail, at most 366 days per call.",
  "Dates are calendar dates in the journal owner's local time, written YYYY-MM-DD. The server does not know the owner's time zone, so pass explicit dates.",
  "save_day adds an entry. It refuses to overwrite an existing day unless replace_existing is true.",
].join(" ");

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

type JsonRpcId = string | number | null;
type JsonRpcResponse = { jsonrpc: "2.0"; id: JsonRpcId } & ({ result: unknown } | { error: { code: number; message: string } });
type StoreProvider = () => JournalStore | Promise<JournalStore>;

function failure({ id, code, message }: { id: JsonRpcId; code: number; message: string }): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function callTool({ params, getStore }: { params: unknown; getStore: StoreProvider }) {
  const { name, arguments: args } = (params ?? {}) as { name?: unknown; arguments?: unknown };
  const tool = MCP_TOOLS.find((candidate) => candidate.name === name);
  if (!tool) return null;
  // A tool that fails reports it in the result, so the agent can read the message and try again.
  try {
    const checked = checkArguments({ schema: tool.inputSchema, args });
    const result = await tool.run({ store: await getStore(), args: checked });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  } catch (error) {
    return { content: [{ type: "text", text: error instanceof Error ? error.message : "The tool failed." }], isError: true };
  }
}

/** Answers one JSON-RPC message. Returns null when the message needs no reply. */
export async function handleMcpMessage({ message, getStore }: { message: unknown; getStore: StoreProvider }): Promise<JsonRpcResponse | null> {
  if (!message || typeof message !== "object" || Array.isArray(message)) return failure({ id: null, code: INVALID_REQUEST, message: "Expected a JSON-RPC message object." });
  const { jsonrpc, id, method, params } = message as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
  const hasId = typeof id === "string" || typeof id === "number";
  // A message without a method is a client's reply to the server, and this server never asks anything.
  if (method === undefined && hasId) return null;
  if (jsonrpc !== "2.0" || typeof method !== "string") return failure({ id: hasId ? (id as JsonRpcId) : null, code: INVALID_REQUEST, message: "Expected a JSON-RPC 2.0 request." });
  if (!hasId) return null; // A notification, such as notifications/initialized.
  const reply = (result: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id: id as JsonRpcId, result });

  if (method === "initialize") {
    const requested = (params as { protocolVersion?: unknown } | undefined)?.protocolVersion;
    return reply({
      protocolVersion: MCP_PROTOCOL_VERSIONS.includes(requested as string) ? requested : MCP_PROTOCOL_VERSIONS[0],
      capabilities: { tools: { listChanged: false } },
      serverInfo: MCP_SERVER_INFO,
      instructions: INSTRUCTIONS,
    });
  }
  if (method === "ping") return reply({});
  if (method === "tools/list") {
    return reply({ tools: MCP_TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })) });
  }
  if (method === "tools/call") {
    const result = await callTool({ params, getStore });
    return result ? reply(result) : failure({ id: id as JsonRpcId, code: INVALID_PARAMS, message: `Unknown tool: ${String((params as { name?: unknown } | undefined)?.name)}` });
  }
  return failure({ id: id as JsonRpcId, code: METHOD_NOT_FOUND, message: `Method not found: ${method}` });
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

/** The HTTP side of the endpoint. Only POST is supported, because the server never streams. */
export async function handleMcpHttp({ request, getStore }: { request: Request; getStore: StoreProvider }): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });
  // MCP clients send no Origin. A browser page on another site does, and must not reach the journal.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json(failure({ id: null, code: INVALID_REQUEST, message: "Cross-origin requests are not allowed." }), 403);
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) return json(failure({ id: null, code: INVALID_REQUEST, message: "Send JSON with Content-Type: application/json." }), 415);
  const version = request.headers.get("mcp-protocol-version");
  if (version && !MCP_PROTOCOL_VERSIONS.includes(version)) return json(failure({ id: null, code: INVALID_REQUEST, message: `Unsupported MCP-Protocol-Version: ${version}` }), 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(failure({ id: null, code: PARSE_ERROR, message: "The request body is not valid JSON." }), 400);
  }
  // Older protocol versions allow a batch of messages in one request.
  if (Array.isArray(body)) {
    if (body.length === 0) return json(failure({ id: null, code: INVALID_REQUEST, message: "The batch is empty." }), 400);
    const responses: JsonRpcResponse[] = [];
    for (const message of body) {
      const response = await handleMcpMessage({ message, getStore });
      if (response) responses.push(response);
    }
    return responses.length ? json(responses) : new Response(null, { status: 202 });
  }
  const response = await handleMcpMessage({ message: body, getStore });
  return response ? json(response) : new Response(null, { status: 202 });
}
