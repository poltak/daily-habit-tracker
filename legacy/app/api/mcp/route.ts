import { handleMcpHttp } from "../../../lib/mcp/server";
import { getServerStore } from "../../../lib/server-store";

export const dynamic = "force-dynamic";

// The Model Context Protocol endpoint. Like every /api route it sits behind the Access check in the Worker.
function handle(request: Request) {
  return handleMcpHttp({ request, getStore: getServerStore });
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
