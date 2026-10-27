import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { authWorker } from "./helpers/auth-worker.mjs";

// Each route file in app/api must need sign-in on a public host. A new route
// then cannot skip the gate by mistake.

const apiRoot = new URL("../app/api/", import.meta.url);

async function routeFiles(directory = apiRoot, prefix = "/api") {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) found.push(...await routeFiles(new URL(`${entry.name}/`, directory), `${prefix}/${entry.name}`));
    else if (entry.name === "route.ts") found.push({ path: prefix, file: new URL(entry.name, directory) });
  }
  return found;
}

test("every API route needs sign-in on a public host, and MCP needs a bearer token", async () => {
  const routes = await routeFiles();
  assert.ok(routes.length >= 15, `found ${routes.length} route files`);
  const worker = authWorker();
  for (const route of routes) {
    const source = await readFile(route.file, "utf8");
    const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"].filter((method) => new RegExp(`export (?:const|async function|function) ${method}\\b`).test(source));
    assert.ok(methods.length > 0, route.path);
    // A dynamic segment gets a sample value.
    const path = route.path.replace(/\[([^\]]+)\]/g, (_, name) => name === "logicalDate" ? "2026-10-01" : name === "kind" ? "goal" : "sample-id");
    for (const method of methods) {
      const response = await worker.request({ path, method, body: method === "GET" ? undefined : {}, headers: method === "GET" ? {} : { origin: worker.origin } });
      assert.equal(response.status, 401, `${method} ${path}`);
      if (path === "/api/mcp") assert.match(response.headers.get("www-authenticate"), /^Bearer resource_metadata=/);
      else assert.equal(response.body.code, "sign_in_required", `${method} ${path}`);
    }
  }
  assert.deepEqual(worker.reached, []);
});

test("the plain Worker serves the same API routes as the route files", async () => {
  const workerSource = await readFile(new URL("../vanilla/worker.ts", import.meta.url), "utf8");
  const listed = [...workerSource.matchAll(/\["(\/api\/[^"]*)"/g)].map((match) => match[1].replace(/:(\w+)/g, "[$1]")).sort();
  const files = (await routeFiles()).map((route) => route.path).sort();
  assert.deepEqual(listed, files);
});
