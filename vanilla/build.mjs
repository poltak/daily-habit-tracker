// Builds the static site in vanilla/dist. There is no bundler and no dependency:
// the page and the scripts in vanilla/site are copied as they are, and the shared
// modules in lib/ only have their type annotations erased.
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = join(root, "vanilla/dist");
const read = (path) => readFile(join(root, path), "utf8");

const IMPORT_SPECIFIER = /^\s*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/gm;

/** The scripts and styles to publish, by their path below the build directory. */
const assets = new Map();

// The styles are the same files the React app uses. Tailwind only supplied the reset, which is now css/reset.css.
const globals = (await read("app/globals.css")).replace('@import "tailwindcss";\n', "");
assets.set("css/app.css", `${await read("vanilla/site/css/reset.css")}\n${globals}`);
// The order is the order in the bundle of the React app, which follows its imports. Rules of equal weight depend on it.
assets.set("css/insights.css", (await Promise.all(["insights-relationships.css", "insights-rhythms.css", "insights.css"].map((name) => read(`app/components/${name}`)))).join("\n"));

// Copy each shared module that the scripts import, with its types erased. A module that nothing imports stays on the server.
const pending = [];
for (const name of (await readdir(join(root, "vanilla/site/js"))).sort()) {
  const source = await read(`vanilla/site/js/${name}`);
  assets.set(`js/${name}`, source);
  for (const [, specifier] of source.matchAll(IMPORT_SPECIFIER)) {
    const target = posix.join("js", specifier);
    if (target.startsWith("lib/")) pending.push(target);
  }
}
while (pending.length > 0) {
  const target = pending.pop();
  if (assets.has(target)) continue;
  const source = stripTypeScriptTypes(await read(target.replace(/\.js$/, ".ts")), { mode: "strip" })
    .replace(IMPORT_SPECIFIER, (statement, specifier) => statement.replace(specifier, specifier.replace(/\.ts$/, ".js")));
  assets.set(target, source);
  for (const [, specifier] of source.matchAll(IMPORT_SPECIFIER)) pending.push(posix.join(posix.dirname(target), specifier));
}

// File names carry no content hash. The directory name carries the build, so each file can be cached for good.
const hash = createHash("sha256");
for (const [path, content] of [...assets].sort()) hash.update(path).update(content);
const base = `b/${hash.digest("hex").slice(0, 12)}`;

await rm(out, { recursive: true, force: true });
await cp(join(root, "public"), out, { recursive: true });
for (const [path, content] of assets) {
  await mkdir(dirname(join(out, base, path)), { recursive: true });
  await writeFile(join(out, base, path), content);
}

// Each page lists every module that its entry script imports, so the browser fetches them together and not one import level at a time.
function modulesFrom(entry) {
  const found = new Set();
  const stack = [entry];
  while (stack.length > 0) {
    const path = stack.pop();
    if (found.has(path)) continue;
    found.add(path);
    for (const [, specifier] of assets.get(path).matchAll(IMPORT_SPECIFIER)) {
      const target = posix.join(posix.dirname(path), specifier);
      if (assets.has(target)) stack.push(target);
    }
  }
  return [...found].sort();
}

/** @param {{ source: string; entry: string }} input */
async function writePage({ source, entry }) {
  const preloads = modulesFrom(entry).map((path) => `<link rel="modulepreload" href="/${base}/${path}">`).join("\n    ");
  return (await read(source)).replaceAll('="/assets/', `="/${base}/`).replace("<!-- modulepreload -->", preloads);
}

const modules = [...assets.keys()].filter((path) => path.endsWith(".js")).sort();
const page = await writePage({ source: "vanilla/site/index.html", entry: "js/app.js" });
await writeFile(join(out, "index.html"), page);
// The Insights page is the same shell at a second address.
await writeFile(join(out, "insights.html"), page);
await writeFile(join(out, "sign-in.html"), await writePage({ source: "vanilla/site/sign-in.html", entry: "js/sign-in.js" }));
// The sign-in page must not show inside a frame of another site, where a click could be hijacked.
await writeFile(join(out, "_headers"), [
  "/b/*\n  Cache-Control: public, max-age=31536000, immutable",
  "/sign-in\n  X-Frame-Options: DENY\n  Content-Security-Policy: frame-ancestors 'none'\n  Referrer-Policy: same-origin\n  Cache-Control: no-store",
].join("\n") + "\n");

console.log(`vanilla/dist/${base}: ${modules.length} modules, ${modules.filter((path) => path.startsWith("lib/")).length} of them from lib/`);
