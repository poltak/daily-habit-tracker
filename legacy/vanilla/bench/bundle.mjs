// Makes a second copy of the plain site in which esbuild joins the 26 modules into one minified file.
// The app code is the same. This copy shows how much of a result comes from the request count and file size, and not from the framework.
// esbuild is the copy that Wrangler installs. The site itself does not use it.
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const source = join(root, "vanilla/dist");
const out = join(root, "vanilla/dist-bundled");
const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve("wrangler"))("esbuild");

const [build] = await readdir(join(source, "b"));
await rm(out, { recursive: true, force: true });
await cp(source, out, { recursive: true, filter: (path) => !path.includes(`${join(source, "b")}`) || path === join(source, "b") });
await mkdir(join(out, "b", build, "js"), { recursive: true });
await mkdir(join(out, "b", build, "css"), { recursive: true });
await esbuild.build({ entryPoints: [join(source, "b", build, "js/app.js")], bundle: true, minify: true, format: "esm", target: "es2022", outfile: join(out, "b", build, "js/app.js"), logLevel: "warning" });
for (const name of ["app.css", "insights.css"]) {
  const { code } = await esbuild.transform(await readFile(join(source, "b", build, "css", name), "utf8"), { loader: "css", minify: true });
  await writeFile(join(out, "b", build, "css", name), code);
}
for (const page of ["index.html", "insights.html"]) {
  const html = (await readFile(join(source, page), "utf8")).replace(/\s*<link rel="modulepreload"[^>]*>/g, "");
  await writeFile(join(out, page), html);
}
console.log(`vanilla/dist-bundled/b/${build}: 1 module`);
