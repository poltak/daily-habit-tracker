import handler from "vinext/server/app-router-entry";
import { withAuth, type AuthEnvironment } from "./auth/index.ts";

type Env = Cloudflare.Env & AuthEnvironment;

// The earlier React runtime. Production deploys vanilla/worker.ts. This Worker has the same sign-in gate, but the React app has no sign-in page.
const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return withAuth({ request, env, next: () => handler.fetch(request, env, ctx) });
  },
};

export default worker;
