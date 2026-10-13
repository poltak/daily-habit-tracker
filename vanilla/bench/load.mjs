// Measures a first visit with an empty cache, and a repeat visit, for each server.
// Usage: NODE_PATH=<playwright> node vanilla/bench/load.mjs react=http://localhost:3101 plain=http://localhost:3102 [--runs=15] [--path=/]
// Each server is reached through an HTTP/2 proxy. Runs alternate between the servers, so drift affects them equally.
import { launchBrowser, format, median, numberOption, printTable, quantile, startHttp2Proxy, targetsFromArguments } from "./lib.mjs";

const targets = targetsFromArguments();
const runs = numberOption("runs", 15);
const path = process.argv.find((argument) => argument.startsWith("--path="))?.split("=")[1] ?? "/";

// The network values are the Lighthouse "slow 4G" throttling values for DevTools.
const PROFILES = [
  { name: "Desktop, no throttling", viewport: { width: 1440, height: 1000 }, cpu: 1, network: null },
  { name: "Phone: CPU 4x slower, slow 4G", viewport: { width: 390, height: 844 }, cpu: 4, network: { offline: false, latency: 562.5, downloadThroughput: 1474.56 * 1024 / 8, uploadThroughput: 675 * 1024 / 8 } },
];

// Runs in the page before its scripts. It records the paint times and the time at which the page can be used.
function observe(path) {
  const metrics = { fcp: NaN, lcp: NaN, cls: 0, longTasks: 0, blocking: 0, shell: NaN, ready: NaN };
  window.__metrics = metrics;
  new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (entry.name === "first-contentful-paint") metrics.fcp = entry.startTime; }).observe({ type: "paint", buffered: true });
  new PerformanceObserver((list) => { for (const entry of list.getEntries()) metrics.lcp = entry.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) metrics.cls += entry.value; }).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver((list) => { for (const entry of list.getEntries()) { metrics.longTasks += 1; metrics.blocking += entry.duration - 50; } }).observe({ type: "longtask", buffered: true });
  // "shell" is the catalog on screen. "ready" is the day loaded and each control enabled.
  const selectors = path.startsWith("/insights")
    ? { shell: ".insights-toolbar", ready: "#insights-best-weeks table, #insights-best-weeks .insights-empty" }
    : { shell: ".goal-list .goal-row", ready: ".mood-option:not(:disabled)" };
  const observer = new MutationObserver(() => {
    if (Number.isNaN(metrics.shell) && document.querySelector(selectors.shell)) metrics.shell = performance.now();
    if (document.querySelector(selectors.ready)) {
      metrics.ready = performance.now();
      observer.disconnect();
    }
  });
  observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"] });
}

async function visit({ browser, url, profile, repeat }) {
  const context = await browser.newContext({ viewport: profile.viewport, ignoreHTTPSErrors: true, serviceWorkers: "block" });
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Performance.enable");
  if (profile.cpu > 1) await session.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu });
  if (profile.network) await session.send("Network.emulateNetworkConditions", profile.network);
  await page.addInitScript(observe, path);

  const requests = new Map();
  session.on("Network.responseReceived", ({ requestId, type, response }) => requests.set(requestId, { type, url: response.url, wire: 0, body: 0, cached: response.fromDiskCache || response.fromPrefetchCache }));
  session.on("Network.dataReceived", ({ requestId, dataLength }) => { const request = requests.get(requestId); if (request) request.body += dataLength; });
  session.on("Network.loadingFinished", ({ requestId, encodedDataLength }) => { const request = requests.get(requestId); if (request) request.wire = encodedDataLength; });

  const load = async () => {
    requests.clear();
    await page.goto(`${url}${path}`, { waitUntil: "load" });
    await page.waitForFunction(() => !Number.isNaN(window.__metrics.ready), null, { timeout: 120_000 });
    // Let the largest paint and any late task settle.
    await page.waitForTimeout(profile.cpu > 1 ? 1500 : 500);
  };
  await load();
  if (repeat) await load();

  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    return { ...window.__metrics, ttfb: navigation.responseStart, domContentLoaded: navigation.domContentLoadedEventEnd, nodes: document.querySelectorAll("*").length };
  });
  await session.send("HeapProfiler.collectGarbage");
  const performance = Object.fromEntries((await session.send("Performance.getMetrics")).metrics.map(({ name, value }) => [name, value]));
  const sameOrigin = [...requests.values()].filter((request) => request.url.startsWith(url));
  const bytes = (types, key) => sameOrigin.filter((request) => types.includes(request.type)).reduce((sum, request) => sum + request[key], 0);
  await context.close();
  return {
    ...metrics,
    // The CPU values are in seconds for the page so far. The throttled profile stretches them by its rate.
    script: performance.ScriptDuration * 1000,
    styleAndLayout: (performance.RecalcStyleDuration + performance.LayoutDuration) * 1000,
    task: performance.TaskDuration * 1000,
    heap: performance.JSHeapUsedSize / 1024,
    requests: sameOrigin.filter((request) => !request.cached).length,
    scriptRequests: sameOrigin.filter((request) => request.type === "Script" && !request.cached).length,
    scriptWire: bytes(["Script"], "wire") / 1024,
    scriptBody: bytes(["Script"], "body") / 1024,
    styleWire: bytes(["Stylesheet"], "wire") / 1024,
    styleBody: bytes(["Stylesheet"], "body") / 1024,
    documentWire: bytes(["Document"], "wire") / 1024,
    documentBody: bytes(["Document"], "body") / 1024,
    apiWire: bytes(["Fetch", "XHR"], "wire") / 1024,
    totalWire: sameOrigin.reduce((sum, request) => sum + request.wire, 0) / 1024,
  };
}

const ROWS = [
  ["ttfb", "Time to first byte", "ms"],
  ["fcp", "First contentful paint", "ms"],
  ["lcp", "Largest contentful paint", "ms"],
  ["shell", "Catalog on screen", "ms"],
  ["ready", "Page ready to use", "ms"],
  ["blocking", "Total blocking time", "ms"],
  ["longTasks", "Long tasks (> 50 ms)", ""],
  ["script", "CPU: script", "ms"],
  ["styleAndLayout", "CPU: style and layout", "ms"],
  ["task", "CPU: all main-thread tasks", "ms"],
  ["cls", "Layout shift", "", 3],
  ["heap", "JS heap after load", " KB"],
  ["nodes", "DOM elements", ""],
  ["requests", "Requests (same origin)", ""],
  ["scriptRequests", "Script requests", ""],
  ["scriptWire", "Script, compressed", " KB", 1],
  ["scriptBody", "Script, uncompressed", " KB", 1],
  ["styleWire", "Styles, compressed", " KB", 1],
  ["documentWire", "HTML, compressed", " KB", 1],
  ["totalWire", "All transfers, compressed", " KB", 1],
];

const proxies = await Promise.all(targets.map((target) => startHttp2Proxy(target.url)));
const browser = await launchBrowser();
const results = {};
try {
  for (const profile of PROFILES) {
    for (const repeat of [false, true]) {
      const samples = targets.map(() => []);
      // One visit to each server that is not counted, so the servers are warm.
      for (const [index] of targets.entries()) await visit({ browser, url: proxies[index].url, profile, repeat });
      for (let run = 0; run < runs; run += 1) {
        for (const [index] of targets.entries()) samples[index].push(await visit({ browser, url: proxies[index].url, profile, repeat }));
      }
      const title = `${profile.name} — ${repeat ? "repeat visit (HTTP cache warm)" : "first visit (empty cache)"} — ${path} — median of ${runs} runs [25th to 75th percentile]`;
      results[title] = Object.fromEntries(targets.map((target, index) => [target.name, Object.fromEntries(ROWS.map(([key]) => [key, median(samples[index].map((sample) => sample[key]))]))]));
      printTable({
        title,
        targets: targets.map((target) => target.name),
        rows: ROWS.map(([key, label, unit, digits = 0]) => ({
          label,
          unit,
          digits,
          values: samples.map((list) => median(list.map((sample) => sample[key]))),
          spread: unit === "ms" ? samples.map((list) => `[${format(quantile(list.map((sample) => sample[key]), 0.25))}–${format(quantile(list.map((sample) => sample[key]), 0.75))}]`) : undefined,
        })),
      });
    }
  }
} finally {
  await browser.close();
  for (const proxy of proxies) proxy.close();
}
if (process.env.BENCH_JSON) (await import("node:fs")).writeFileSync(process.env.BENCH_JSON, JSON.stringify(results, null, 2));
