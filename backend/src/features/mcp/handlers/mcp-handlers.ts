import { Hono, type Context } from "hono";
import type { RequestEnvironment } from "../../core/handlers/types.js";
import type { BackendLogic } from "../../core/types.js";
import { answerPlaceholder } from "./mcp-placeholder.js";

interface McpHandlerProps {
  logic: Pick<BackendLogic, "authOAuthToken">;
}

/**
 * The MCP endpoint of agents such as Claude. Mount it before `/api`, because
 * `/api` refuses a request without the owner's session cookie, and this
 * endpoint takes only the access token of a connected app.
 */
export function createMcpHandlers({ logic }: McpHandlerProps) {
  /** The response that sends the client to sign in, or `null` for a valid token. */
  async function refuse(
    context: Context<RequestEnvironment>,
  ): Promise<Response | null> {
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

  return new Hono<RequestEnvironment>()
    .get("/api/mcp", async (context) => {
      return (
        (await refuse(context)) ??
        new Response(null, { status: 405, headers: { allow: "POST" } })
      );
    })
    .post("/api/mcp", async (context) => {
      const refused = await refuse(context);
      if (refused) {
        return refused;
      }
      // The MCP phase replaces this line with the JSON-RPC handler.
      return answerPlaceholder(context.req.raw);
    });
}
