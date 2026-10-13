// Runs Lighthouse (phone preset, simulated slow 4G and a 4x slower CPU) on each server and prints the median of the runs.
// Usage: LIGHTHOUSE_BIN=<path to the lighthouse command> node vanilla/bench/lighthouse.mjs react=http://localhost:3101 plain=http://localhost:3102 [--runs=5]
// Each server is reached through an HTTP/2 proxy, as in load.mjs.
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { median, numberOption, printTable, startHttp2Proxy, targetsFromArguments } from "./lib.mjs";

const targets = targetsFromArguments();
const runs = numberOption("runs", 5);
const lighthouse = process.env.LIGHTHOUSE_BIN ?? "lighthouse";
const directory = mkdtempSync(join(process.env.DAYMARK_BENCH_DIR ?? tmpdir(), "lighthouse-"));

const ROWS = [
  ["performance", "Performance score", ""],
  ["accessibility", "Accessibility score", ""],
  ["best-practices", "Best practices score", ""],
  ["first-contentful-paint", "First contentful paint", "ms"],
  ["largest-contentful-paint", "Largest contentful paint", "ms"],
  ["speed-index", "Speed index", "ms"],
  ["total-blocking-time", "Total blocking time", "ms"],
  ["interactive", "Time to interactive", "ms"],
  ["cumulative-layout-shift", "Layout shift", "", 3],
  ["bootup-time", "Script evaluation", "ms"],
  ["mainthread-work-breakdown", "Main-thread work", "ms"],
  ["total-byte-weight", "Transfer size", " KB", 1],
];

async function audit(url, index) {
  const output = join(directory, `report-${index}.json`);
  await promisify(execFile)(lighthouse, [url, "--quiet", "--output=json", `--output-path=${output}`, "--only-categories=performance,accessibility,best-practices", "--chrome-flags=--headless=new --ignore-certificate-errors"], { maxBuffer: 64 * 1024 * 1024 });
  const report = JSON.parse(readFileSync(output, "utf8"));
  return Object.fromEntries(ROWS.map(([key]) => {
    if (report.categories[key]) return [key, report.categories[key].score * 100];
    const value = report.audits[key]?.numericValue ?? NaN;
    return [key, key === "total-byte-weight" ? value / 1024 : value];
  }));
}

const proxies = await Promise.all(targets.map((target) => startHttp2Proxy(target.url)));
try {
  const samples = targets.map(() => []);
  let count = 0;
  for (let run = 0; run < runs; run += 1) {
    for (const [index] of targets.entries()) samples[index].push(await audit(`${proxies[index].url}/`, count++));
  }
  printTable({
    title: `Lighthouse, phone preset with simulated throttling — median of ${runs} runs`,
    targets: targets.map((target) => target.name),
    rows: ROWS.map(([key, label, unit, digits = 0]) => ({ label, unit, digits, values: samples.map((list) => median(list.map((sample) => sample[key]))) })),
  });
} finally {
  for (const proxy of proxies) proxy.close();
  rmSync(directory, { recursive: true, force: true });
}
