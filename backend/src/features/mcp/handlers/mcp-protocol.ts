import {
  SERVER_INFO,
  SERVER_INSTRUCTIONS,
  SUPPORTED_PROTOCOL_VERSIONS,
  TOOL_DEFINITIONS,
} from "../utils/tool-definitions.js";

export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

type RequestId = string | number | null;

interface ToolCallResult {
  content: { type: "text"; text: string }[];
  isError?: true;
}

/** The result of a tool, or `null` for a name that is not a tool. */
export type CallTool = (input: {
  name: string;
  arguments: unknown;
}) => Promise<ToolCallResult | null>;

export function failure({
  id,
  code,
  message,
}: {
  id: RequestId;
  code: number;
  message: string;
}) {
  return { jsonrpc: "2.0" as const, id, error: { code, message } };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Answer one JSON-RPC message of the MCP protocol. A notification, and a
 * reply of the client (this server asks nothing), have no answer: `null`.
 */
async function answerMessage({
  message,
  callTool,
}: {
  message: unknown;
  callTool: CallTool;
}) {
  if (!isObject(message)) {
    return failure({
      id: null,
      code: INVALID_REQUEST,
      message: "Expected a JSON-RPC message object.",
    });
  }
  const { jsonrpc, id, method, params } = message;
  const hasId = typeof id === "string" || typeof id === "number";
  if (method === undefined && hasId) {
    return null;
  }
  if (jsonrpc !== "2.0" || typeof method !== "string") {
    return failure({
      id: hasId ? id : null,
      code: INVALID_REQUEST,
      message: "Expected a JSON-RPC 2.0 request.",
    });
  }
  if (!hasId) {
    return null;
  }
  const reply = (result: unknown) => ({ jsonrpc: "2.0" as const, id, result });

  if (method === "initialize") {
    const requested = isObject(params) ? params["protocolVersion"] : undefined;
    return reply({
      protocolVersion:
        typeof requested === "string" &&
        SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
          ? requested
          : SUPPORTED_PROTOCOL_VERSIONS[0],
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
      instructions: SERVER_INSTRUCTIONS,
    });
  }
  if (method === "ping") {
    return reply({});
  }
  if (method === "tools/list") {
    return reply({ tools: TOOL_DEFINITIONS });
  }
  if (method === "tools/call") {
    const name = isObject(params) ? params["name"] : undefined;
    const result =
      typeof name === "string"
        ? await callTool({
            name,
            arguments: isObject(params) ? params["arguments"] : undefined,
          })
        : null;
    return result
      ? reply(result)
      : failure({
          id,
          code: INVALID_PARAMS,
          message: `Unknown tool: ${String(name)}`,
        });
  }
  return failure({
    id,
    code: METHOD_NOT_FOUND,
    message: `Method not found: ${method}`,
  });
}

/**
 * Answer the body of a POST: one message, or a batch that older protocol
 * versions allow. The answer is `null` when nothing is left to answer, and
 * the HTTP status is then 202.
 */
export async function answerBody({
  body,
  callTool,
}: {
  body: unknown;
  callTool: CallTool;
}) {
  if (!Array.isArray(body)) {
    return answerMessage({ message: body, callTool });
  }
  const answers = [];
  for (const message of body as unknown[]) {
    const answer = await answerMessage({ message, callTool });
    if (answer !== null) {
      answers.push(answer);
    }
  }
  return answers.length > 0 ? answers : null;
}
