/**
 * The answer of the MCP endpoint until the MCP phase builds the tools. It lets
 * a connected client agree on a protocol version and keep a session open. The
 * MCP phase deletes this file.
 */

const SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

export async function answerPlaceholder(request: Request): Promise<Response> {
  let message: unknown;
  try {
    message = await request.json();
  } catch {
    return Response.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      },
      { status: 400 },
    );
  }
  const body = (message ?? {}) as {
    id?: string | number;
    method?: string;
    params?: { protocolVersion?: string };
  };
  if (body.id === undefined) {
    return new Response(null, { status: 202 });
  }
  const result = (() => {
    if (body.method === "initialize") {
      const asked = body.params?.protocolVersion ?? "";
      return {
        protocolVersion: SUPPORTED_VERSIONS.includes(asked)
          ? asked
          : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "daymark", version: "1.0.0" },
      };
    }
    return body.method === "ping" ? {} : null;
  })();
  return Response.json(
    result === null
      ? {
          jsonrpc: "2.0",
          id: body.id,
          error: { code: -32601, message: "Method not found" },
        }
      : { jsonrpc: "2.0", id: body.id, result },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}
