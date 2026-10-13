import { validAccessRequest, type AccessEnvironment } from "../worker/auth";
import * as bootstrap from "../app/api/bootstrap/route";
import * as calendar from "../app/api/calendar/route";
import * as catalogItem from "../app/api/catalog/[kind]/[id]/route";
import * as catalogReorder from "../app/api/catalog/reorder/route";
import * as catalog from "../app/api/catalog/route";
import * as activitySelection from "../app/api/day-selections/[logicalDate]/activities/[activityId]/route";
import * as moodSelection from "../app/api/day-selections/[logicalDate]/mood/route";
import * as entry from "../app/api/entries/[logicalDate]/route";
import * as entries from "../app/api/entries/route";
import * as exportData from "../app/api/export/route";
import * as goalCompletion from "../app/api/goal-completions/[logicalDate]/[goalId]/route";
import * as goalHistory from "../app/api/goals/[goalId]/history/route";
import * as health from "../app/api/health/route";
import * as importData from "../app/api/import/route";
import * as insights from "../app/api/insights/route";
import * as mcp from "../app/api/mcp/route";
import * as settings from "../app/api/settings/route";

type Env = Cloudflare.Env & AccessEnvironment;
type RouteHandler = (request: Request, context: { params: Promise<Record<string, string>> }) => Response | Promise<Response>;
type RouteModule = Partial<Record<string, unknown>>;

// The same handlers the Next.js router calls, so both runtimes give the same API.
const ROUTES: Array<{ pattern: URLPattern; module: RouteModule }> = ([
  ["/api/bootstrap", bootstrap],
  ["/api/calendar", calendar],
  ["/api/catalog", catalog],
  ["/api/catalog/reorder", catalogReorder],
  ["/api/catalog/:kind/:id", catalogItem],
  ["/api/day-selections/:logicalDate/activities/:activityId", activitySelection],
  ["/api/day-selections/:logicalDate/mood", moodSelection],
  ["/api/entries", entries],
  ["/api/entries/:logicalDate", entry],
  ["/api/export", exportData],
  ["/api/goal-completions/:logicalDate/:goalId", goalCompletion],
  ["/api/goals/:goalId/history", goalHistory],
  ["/api/health", health],
  ["/api/import", importData],
  ["/api/insights", insights],
  ["/api/mcp", mcp],
  ["/api/settings", settings],
] as Array<[string, RouteModule]>).map(([pathname, module]) => ({ pattern: new URLPattern({ pathname }), module }));

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

function decodeParams(groups: Record<string, string | undefined>) {
  const params: Record<string, string> = {};
  for (const [name, value] of Object.entries(groups)) {
    try {
      params[name] = decodeURIComponent(value ?? "");
    } catch {
      params[name] = value ?? "";
    }
  }
  return params;
}

async function handleApi(request: Request, url: URL) {
  for (const { pattern, module } of ROUTES) {
    const match = pattern.exec({ pathname: url.pathname });
    if (!match) continue;
    const allowed = METHODS.filter((method) => typeof module[method] === "function");
    // A HEAD request gets the headers of the GET response.
    const handler = module[request.method === "HEAD" ? "GET" : request.method] as RouteHandler | undefined;
    if (typeof handler !== "function") return new Response(null, { status: 405, headers: { allow: allowed.join(", ") } });
    try {
      const response = await handler(request, { params: Promise.resolve(decodeParams(match.pathname.groups)) });
      return request.method === "HEAD" ? new Response(null, response) : response;
    } catch (error) {
      console.error(error);
      return new Response("Internal Server Error", { status: 500 });
    }
  }
  return Response.json({ error: "Not found." }, { status: 404 });
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      if (!(await validAccessRequest(request, env))) return Response.json({ error: "Authentication required." }, { status: 403 });
      return handleApi(request, url);
    }
    // The pages and their files are static assets. A request reaches this line only when no asset has its path.
    return new Response("<!doctype html><title>Page not found</title><h1>404</h1><p>This page could not be found.</p>", {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
};

export default worker;
