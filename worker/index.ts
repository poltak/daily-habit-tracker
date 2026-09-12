import handler from "vinext/server/app-router-entry";
import { validAccessRequest, type AccessEnvironment } from "./auth";

type Env = Cloudflare.Env & AccessEnvironment;

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/") && !(await validAccessRequest(request, env))) {
      return Response.json({ error: "Authentication required." }, { status: 403 });
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
