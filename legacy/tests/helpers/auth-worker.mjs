import { handleMcpHttp } from "../../lib/mcp/server.ts";
import { DaylioMemoryStore } from "../../lib/memory-store.ts";
import { withAuth } from "../../worker/auth/index.ts";
import { createTestDatabase } from "./d1-database.mjs";

// Runs the sign-in gate with the real SQL on an in-memory database. The app
// behind the gate is a stub that names the path, and the real MCP handler.

export const ORIGIN = "https://journal.example";
export const SETUP_CODE = "correct horse battery staple";

export function authWorker({ origin = ORIGIN, env = {} } = {}) {
  const db = createTestDatabase();
  const store = new DaylioMemoryStore();
  const reached = [];
  const fullEnv = { DB: db, DAYMARK_SETUP_CODE: SETUP_CODE, ...env };

  async function fetch(path, init = {}) {
    const request = new Request(`${origin}${path}`, init);
    return withAuth({
      request,
      env: fullEnv,
      next: async () => {
        reached.push(`${request.method} ${new URL(request.url).pathname}`);
        if (new URL(request.url).pathname === "/api/mcp") return handleMcpHttp({ request, getStore: () => store });
        return Response.json({ ok: true });
      },
    });
  }

  /** A JSON request. The body is parsed when it is JSON. */
  async function request({ path, method = "GET", body, headers = {} }) {
    const response = await fetch(path, {
      method,
      headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: response.status, headers: response.headers, body: parsed };
  }

  return { db, env: fullEnv, origin, reached, fetch, request };
}

/** A browser with a cookie jar. Writes send this site's Origin unless a test says otherwise. */
export function browser(worker) {
  const jar = { cookie: null };
  function remember(response) {
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) jar.cookie = /Max-Age=0/.test(setCookie) ? null : setCookie.split(";")[0];
    return response;
  }
  async function call({ path, method = "GET", body, origin = method === "GET" ? null : worker.origin, headers = {} }) {
    return remember(await worker.request({
      path,
      method,
      body,
      headers: { ...(jar.cookie ? { cookie: jar.cookie } : {}), ...(origin ? { origin } : {}), ...headers },
    }));
  }
  async function page(path, init = {}) {
    return remember(await worker.fetch(path, { redirect: "manual", ...init, headers: { ...(jar.cookie ? { cookie: jar.cookie } : {}), ...init.headers } }));
  }
  return { jar, call, page };
}

export async function setUp({ user, authenticator, origin = ORIGIN, setupCode = SETUP_CODE }) {
  const options = await user.call({ path: "/api/auth/register/options", method: "POST", body: setupCode === undefined ? {} : { setupCode } });
  if (options.status !== 200) throw new Error(`register/options: ${options.status} ${JSON.stringify(options.body)}`);
  const response = await authenticator.register({ options: options.body.options, origin });
  const verified = await user.call({ path: "/api/auth/register/verify", method: "POST", body: { challengeId: options.body.challengeId, response } });
  return { options, verified };
}

export async function signIn({ user, authenticator, origin = ORIGIN, tamper = false }) {
  const options = await user.call({ path: "/api/auth/login/options", method: "POST", body: {} });
  if (options.status !== 200) return options;
  const response = await authenticator.signIn({ options: options.body.options, origin, tamper });
  return user.call({ path: "/api/auth/login/verify", method: "POST", body: { challengeId: options.body.challengeId, response } });
}
