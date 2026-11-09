// Shared parts of the measurement scripts. Playwright comes from NODE_PATH, as it does for tests/browser.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import http from "node:http";
import http2 from "node:http2";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Starts Chrome. Only the scripts that open a page need Playwright. */
export function launchBrowser() {
  const { chromium } = createRequire(import.meta.url)("playwright");
  return chromium.launch({ headless: true, channel: process.env.BENCH_BROWSER ?? "chrome" });
}

/** The servers to measure, from arguments such as `react=http://localhost:3101 plain=http://localhost:3102`. */
export function targetsFromArguments() {
  const targets = process.argv.slice(2).filter((argument) => /^[\w-]+=http/.test(argument)).map((argument) => {
    const [name, ...rest] = argument.split("=");
    const url = rest.join("=");
    assert.ok(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Measure a local server only.");
    return { name, url };
  });
  assert.ok(targets.length > 0, "Give one or more servers, for example: react=http://localhost:3101 plain=http://localhost:3102");
  return targets;
}

/** @param {string} name @param {number} fallback */
export function numberOption(name, fallback) {
  const argument = process.argv.find((candidate) => candidate.startsWith(`--${name}=`));
  return argument ? Number(argument.split("=")[1]) : fallback;
}

/**
 * Serves `target` over HTTP/2 with TLS, as the production host does. A local Wrangler server speaks only HTTP/1.1,
 * where six connections limit the parallel requests. That limit does not apply in production.
 * @param {string} target
 * @returns {Promise<{ url: string; close: () => void }>}
 */
export async function startHttp2Proxy(target) {
  const directory = process.env.DAYMARK_BENCH_DIR ?? join(tmpdir(), "daymark-bench-cert");
  if (!existsSync(join(directory, "key.pem"))) {
    mkdirSync(directory, { recursive: true });
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(directory, "key.pem"), "-out", join(directory, "cert.pem"), "-days", "30", "-subj", "/CN=localhost"], { stdio: "ignore" });
  }
  const upstream = new URL(target);
  const agent = new http.Agent({ keepAlive: true, maxSockets: 64 });
  const server = http2.createSecureServer({ key: readFileSync(join(directory, "key.pem")), cert: readFileSync(join(directory, "cert.pem")) });
  server.on("stream", (stream, headers) => {
    const requestHeaders = Object.fromEntries(Object.entries(headers).filter(([name]) => !name.startsWith(":")));
    const request = http.request({
      host: upstream.hostname,
      port: upstream.port,
      agent,
      method: headers[":method"],
      path: headers[":path"],
      headers: { ...requestHeaders, host: upstream.host },
    }, (response) => {
      const responseHeaders = Object.fromEntries(Object.entries(response.headers).filter(([name]) => !["connection", "keep-alive", "transfer-encoding"].includes(name)));
      if (stream.destroyed) return;
      stream.respond({ ":status": response.statusCode, ...responseHeaders });
      response.pipe(stream);
    });
    request.on("error", () => stream.destroyed || stream.close());
    stream.on("error", () => request.destroy());
    stream.pipe(request);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
  const { port } = /** @type {import("node:net").AddressInfo} */ (server.address());
  return { url: `https://localhost:${port}`, close: () => { server.close(); agent.destroy(); } };
}

/** @param {number[]} values @param {number} fraction */
export function quantile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return NaN;
  const position = (sorted.length - 1) * fraction;
  const low = Math.floor(position);
  return sorted[low] + (sorted[Math.min(low + 1, sorted.length - 1)] - sorted[low]) * (position - low);
}

/** @param {number[]} values */
export const median = (values) => quantile(values, 0.5);

/** @param {number} value @param {number} [digits] */
export function format(value, digits = 0) {
  return Number.isFinite(value) ? value.toLocaleString("en", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "—";
}

/**
 * Prints one row for each metric and one column for each target. Each target after the first also shows its change from the first.
 * @param {{ title: string; targets: string[]; rows: Array<{ label: string; values: number[]; digits?: number; unit?: string; spread?: string[] }> }} input
 */
export function printTable({ title, targets, rows }) {
  const labelWidth = Math.max(...rows.map((row) => row.label.length), 6) + 2;
  const width = rows.some((row) => row.spread) ? 32 : 22;
  console.log(`\n${title}`);
  console.log(`${"".padEnd(labelWidth)}${targets.map((target) => target.padStart(width)).join("")}`);
  for (const { label, values, digits = 0, unit = "", spread } of rows) {
    const cells = values.map((value, index) => {
      const first = values[0];
      const change = index > 0 && Number.isFinite(first) && Number.isFinite(value) && first !== 0 ? ` (${value >= first ? "+" : ""}${format((value - first) / first * 100)}%)` : "";
      return `${format(value, digits)}${unit}${spread ? ` ${spread[index]}` : ""}${change}`.padStart(width);
    });
    console.log(`${label.padEnd(labelWidth)}${cells.join("")}`);
  }
}
