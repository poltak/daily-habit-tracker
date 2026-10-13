// Reports what each build ships and what each stack is made of: bytes for the browser and for the Worker,
// source lines, and packages. Run `pnpm run build` and `pnpm run build:vanilla` first.
// Usage: node vanilla/bench/size.mjs
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { printTable } from "./lib.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));

/** @param {string} directory @returns {string[]} */
function filesIn(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name));
}

/** @param {string[]} files */
function weigh(files) {
  let raw = 0;
  let gzip = 0;
  let brotli = 0;
  for (const file of files) {
    const content = readFileSync(file);
    raw += content.length;
    gzip += gzipSync(content, { level: 9 }).length;
    brotli += brotliCompressSync(content, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
  }
  return { files: files.length, raw, gzip, brotli };
}

/** @param {string[]} files */
function countLines(files) {
  let lines = 0;
  let code = 0;
  for (const file of files) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      lines += 1;
      const text = line.trim();
      // A line that has code: not empty, and not only a comment.
      if (text && !text.startsWith("//") && !text.startsWith("/*") && !text.startsWith("*")) code += 1;
    }
  }
  return { files: files.length, lines, code };
}

// What the browser loads on a first visit.
const reactClient = join(root, "dist/client");
const plainClient = join(root, "vanilla/dist");
const bundledClient = join(root, "vanilla/dist-bundled");
const clients = [
  { name: "react", script: filesIn(join(reactClient, "assets")).filter((file) => file.endsWith(".js")), style: filesIn(join(reactClient, "assets")).filter((file) => file.endsWith(".css")) },
  { name: "plain", script: filesIn(join(plainClient, "b")).filter((file) => file.endsWith(".js")), style: filesIn(join(plainClient, "b")).filter((file) => file.endsWith(".css")) },
  { name: "plain-bundled", script: filesIn(join(bundledClient, "b")).filter((file) => file.endsWith(".js")), style: filesIn(join(bundledClient, "b")).filter((file) => file.endsWith(".css")) },
].filter((client) => client.script.length > 0);
const kb = (bytes) => bytes / 1024;
for (const [label, key] of [["Scripts for the browser", "script"], ["Styles for the browser", "style"]]) {
  const weights = clients.map((client) => weigh(client[key]));
  printTable({
    title: label,
    targets: clients.map((client) => client.name),
    rows: [
      { label: "Files", values: weights.map((weight) => weight.files) },
      { label: "Raw", unit: " KB", digits: 1, values: weights.map((weight) => kb(weight.raw)) },
      { label: "gzip -9", unit: " KB", digits: 1, values: weights.map((weight) => kb(weight.gzip)) },
      { label: "Brotli 11", unit: " KB", digits: 1, values: weights.map((weight) => kb(weight.brotli)) },
    ],
  });
}

// What the Worker uploads. Wrangler bundles the plain Worker in a dry run; the React Worker is the output of the build.
const reactWorker = filesIn(join(root, "dist/server")).filter((file) => file.endsWith(".js"));
const dryRun = mkdtempSync(join(tmpdir(), "daymark-worker-"));
execFileSync(process.execPath, [join(root, "node_modules/wrangler/bin/wrangler.js"), "deploy", "--dry-run", "--outdir", dryRun, "--config", join(root, "vanilla/wrangler.jsonc")], { cwd: root, stdio: "ignore", env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" } });
const plainWorker = filesIn(dryRun).filter((file) => file.endsWith(".js"));
const workers = [weigh(reactWorker), weigh(plainWorker)];
rmSync(dryRun, { recursive: true, force: true });
printTable({
  title: "Worker script (the server)",
  targets: ["react", "plain"],
  rows: [
    { label: "Modules", values: workers.map((weight) => weight.files) },
    { label: "Raw", unit: " KB", digits: 1, values: workers.map((weight) => kb(weight.raw)) },
    { label: "gzip -9", unit: " KB", digits: 1, values: workers.map((weight) => kb(weight.gzip)) },
  ],
});

// The source that a person maintains for the interface.
const reactSource = [...filesIn(join(root, "app")).filter((file) => file.endsWith(".tsx")), join(root, "worker/index.ts")];
const plainSource = [...filesIn(join(root, "vanilla/site/js")), join(root, "vanilla/worker.ts"), join(root, "vanilla/build.mjs"), join(root, "vanilla/site/index.html")];
const sources = [countLines(reactSource), countLines(plainSource)];
printTable({
  title: "Interface source (the shared lib/ modules, the API handlers and the styles are the same for both)",
  targets: ["react", "plain"],
  rows: [
    { label: "Files", values: sources.map((source) => source.files) },
    { label: "Lines", values: sources.map((source) => source.lines) },
    { label: "Lines with code", values: sources.map((source) => source.code) },
    { label: "Size", unit: " KB", digits: 1, values: [reactSource, plainSource].map((files) => kb(files.reduce((sum, file) => sum + statSync(file).size, 0))) },
  ],
});

console.log(`\nSizes are of files on disk in ${relative(process.cwd(), root) || "."}. The load benchmark reports what the server sends.`);
