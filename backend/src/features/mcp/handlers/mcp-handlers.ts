import { Hono, type Context } from "hono";
import { routeBodyLimit } from "../../core/handlers/body-limit.js";
import type { RequestEnvironment } from "../../core/handlers/types.js";
import type { BackendLogic, BackendServices } from "../../core/types.js";
import { SUPPORTED_PROTOCOL_VERSIONS } from "../utils/tool-definitions.js";
import {
  INVALID_REQUEST,
  PARSE_ERROR,
  answerBody,
  failure,
} from "./mcp-protocol.js";
import { createToolCaller } from "./tool-calls.js";

interface McpHandlerProps {
  logic: Pick<BackendLogic, "authOAuthToken" | "catalog" | "days" | "settings">;
  services: Pick<BackendServices, "logger">;
}

/** A message of a client is small. A larger body is refused. */
const MAX_BODY_BYTES = 256 * 1024;

type McpContext = Context<RequestEnvironment>;

function jsonRpcError({
  status,
  code,
  message,
}: {
  status: 400 | 403 | 413 | 415;
  code: number;
  message: string;
}) {
  return Response.json(failure({ id: null, code, message }), {
    status,
    headers: { "cache-control": "no-store" },
  });
}

/** A client of this endpoint sends no `Origin`. A page of another site does, and must not reach the journal. */
function refuseRequest(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return jsonRpcError({
      status: 403,
      code: INVALID_REQUEST,
      message: "Cross-origin requests are not allowed.",
    });
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return jsonRpcError({
      status: 415,
      code: INVALID_REQUEST,
      message: "Send JSON with Content-Type: application/json.",
    });
  }
  const version = request.headers.get("mcp-protocol-version");
  if (version && !SUPPORTED_PROTOCOL_VERSIONS.includes(version)) {
    return jsonRpcError({
      status: 400,
      code: INVALID_REQUEST,
      message: `Unsupported MCP-Protocol-Version: ${version}`,
    });
  }
  return null;
}

/** The body, or `null` when it is larger than the limit. Nothing larger stays in memory. */
async function readBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return null;
  }
  if (!request.body) {
    return "";
  }
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return text + decoder.decode();
    }
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
}

/**
 * The MCP endpoint of agents such as Claude, over streamable HTTP without
 * sessions: each POST carries one JSON-RPC message, or a batch, and gets a
 * JSON answer. It never streams, so GET is not allowed. Mount it before
 * `/api`, because `/api` refuses a request without the owner's session
 * cookie, and this endpoint takes only the access token of a connected app.
 */
export function createMcpHandlers({ logic, services }: McpHandlerProps) {
  const callTool = createToolCaller({ logic, services });

  /** The response that sends the client to sign in, or `null` for a valid token. */
  async function refuse(context: McpContext): Promise<Response | null> {
    const origin = new URL(context.req.url).origin;
    const token =
      context.req
        .header("authorization")
        ?.match(/^Bearer\s+([A-Za-z0-9_-]+)$/i)?.[1] ?? null;
    if (
      token &&
      (await logic.authOAuthToken.verifyAccessToken({ token, origin }))
    ) {
      return null;
    }
    return Response.json(
      { error: "Sign-in is required.", code: "unauthorized" },
      {
        status: 401,
        headers: {
          "cache-control": "no-store",
          "www-authenticate": logic.authOAuthToken.challenge({
            origin,
            invalidToken: token !== null,
          }),
        },
      },
    );
  }

  return (
    new Hono<RequestEnvironment>()
      .get("/api/mcp", async (context) => {
        return (
          (await refuse(context)) ??
          new Response(null, { status: 405, headers: { allow: "POST" } })
        );
      })
      // The default limit is lower than the limit of this endpoint, and its
      // error is not a JSON-RPC error. The check in `readBody` refuses a body
      // over `MAX_BODY_BYTES`, so this limit only has to be higher.
      .post(
        "/api/mcp",
        routeBodyLimit({ maxBytes: MAX_BODY_BYTES * 2 }),
        async (context) => {
          const refused =
            (await refuse(context)) ?? refuseRequest(context.req.raw);
          if (refused) {
            return refused;
          }
          const text = await readBody(context.req.raw);
          if (text === null) {
            return jsonRpcError({
              status: 413,
              code: INVALID_REQUEST,
              message: "The request is too large.",
            });
          }
          let body: unknown;
          try {
            body = JSON.parse(text);
          } catch {
            return jsonRpcError({
              status: 400,
              code: PARSE_ERROR,
              message: "The request body is not valid JSON.",
            });
          }
          if (Array.isArray(body) && body.length === 0) {
            return jsonRpcError({
              status: 400,
              code: INVALID_REQUEST,
              message: "The batch is empty.",
            });
          }
          const answer = await answerBody({ body, callTool });
          return answer === null
            ? new Response(null, { status: 202 })
            : Response.json(answer, {
                status: 200,
                headers: { "cache-control": "no-store" },
              });
        },
      )
  );
}
