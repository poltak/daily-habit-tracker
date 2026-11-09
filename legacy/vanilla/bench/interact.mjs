// Measures the main-thread cost of the same interactions on each server.
// Usage: NODE_PATH=<playwright> node vanilla/bench/interact.mjs react=http://localhost:3101 plain=http://localhost:3102 [--runs=15] [--cpu=4]
// For each interaction it reports the time from the event to the next frame, and the CPU time until the page is idle again.
import { launchBrowser, median, numberOption, printTable, targetsFromArguments } from "./lib.mjs";

const targets = targetsFromArguments();
const runs = numberOption("runs", 15);
const cpu = numberOption("cpu", 4);

// Runs in the page. `window.__act` does one action and resolves with the time to the frame after it.
function install() {
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
  const setValue = (element, value) => {
    const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value);
  };
  window.__act = async ({ kind, selector, index = 0, value }) => {
    const element = [...document.querySelectorAll(selector)][index];
    if (!element) throw new Error(`No element for ${selector} [${index}]`);
    // Start from a quiet frame, so earlier work is not counted.
    await frame();
    const start = performance.now();
    if (kind === "click") element.click();
    else if (kind === "input") { setValue(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); }
    else if (kind === "change") { setValue(element, value); element.dispatchEvent(new Event("change", { bubbles: true })); }
    else if (kind === "key") window.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true }));
    await frame();
    return performance.now() - start;
  };
}

/** The steps, in order. Each measured step runs `runs` times: `before` puts the page in its start state and is not measured. */
const STEPS = [
  { name: "Select a mood", act: (run) => ({ kind: "click", selector: ".mood-option", index: run % 5 }) },
  { name: "Mark a goal", act: () => ({ kind: "click", selector: ".goal-checkbox", index: 3 }) },
  { name: "Select an activity (60 shown)", before: async (page) => { await page.evaluate(() => { for (const details of document.querySelectorAll(".activity-groups details")) details.open = true; }); }, act: (run) => ({ kind: "click", selector: ".activity-button", index: 5 + (run % 2) }) },
  { name: "Type in activity search", act: (run) => ({ kind: "input", selector: ".activities-panel .search-field input", value: "walk".slice(0, 1 + (run % 4)) }), after: async (page) => { await page.evaluate(() => window.__act({ kind: "input", selector: ".activities-panel .search-field input", value: "" })); } },
  { name: "Open Calendar", act: () => ({ kind: "click", selector: ".bottom-nav button", index: 1 }), restore: { kind: "click", selector: ".bottom-nav button", index: 0 }, settled: ".calendar-grid .calendar-day" },
  { name: "Calendar: previous month", before: async (page) => { await page.evaluate(() => window.__act({ kind: "click", selector: ".bottom-nav button", index: 1 })); }, act: (run) => ({ kind: "click", selector: ".calendar-heading .icon-button", index: run % 2 }) },
  { name: "Open Setup (2,000 elements)", act: () => ({ kind: "click", selector: ".bottom-nav button", index: 3 }), restore: { kind: "click", selector: ".bottom-nav button", index: 0 }, settled: ".management-groups details" },
  { name: "Setup: type in filter", before: async (page) => { await page.evaluate(() => window.__act({ kind: "click", selector: ".bottom-nav button", index: 3 })); }, act: (run) => ({ kind: "input", selector: ".settings-page .search-field input", value: "co".slice(0, 1 + (run % 2)) }) },
  { name: "Setup: open icon picker", before: async (page) => { await page.evaluate(() => window.__act({ kind: "input", selector: ".settings-page .search-field input", value: "c" })); }, act: () => ({ kind: "click", selector: '.management-row button[aria-label^="Choose icon for"]', index: 0 }), restore: { kind: "key", selector: "body", value: "Escape" }, settled: ".icon-picker .icon-choice" },
  { name: "Icon picker: type in search", before: async (page) => { await page.evaluate(() => window.__act({ kind: "click", selector: '.management-row button[aria-label^="Choose icon for"]', index: 0 })); }, act: (run) => ({ kind: "input", selector: ".icon-picker input", value: "sport".slice(0, 1 + (run % 5)) }), after: async (page) => { await page.evaluate(() => window.__act({ kind: "key", selector: "body", value: "Escape" })); } },
  { name: "Open Insights (3,000 elements)", act: () => ({ kind: "click", selector: ".bottom-nav button", index: 2 }), restore: { kind: "click", selector: ".bottom-nav button", index: 0 }, settled: "#insights-best-weeks table" },
  { name: "Insights: change period", before: async (page) => { await page.evaluate(() => window.__act({ kind: "click", selector: ".bottom-nav button", index: 2 })); await page.locator("#insights-best-weeks table").first().waitFor(); }, act: (run) => ({ kind: "change", selector: ".insights-toolbar select", value: run % 2 ? "all" : "1y" }), settled: "#insights-best-weeks table" },
  { name: "Insights: select an activity", act: (run) => ({ kind: "click", selector: ".insight-rel-ranking-row", index: 1 + (run % 2) }) },
  { name: "Open Log", before: async (page) => { await page.evaluate(() => window.__act({ kind: "click", selector: ".bottom-nav button", index: 3 })); }, act: () => ({ kind: "click", selector: ".bottom-nav button", index: 0 }), restore: { kind: "click", selector: ".bottom-nav button", index: 3 }, settled: ".mood-option" },
];

/** @type {WeakMap<object, Set<object>>} */
const inFlight = new WeakMap();

function trackRequests(page) {
  const requests = new Set();
  inFlight.set(page, requests);
  page.on("request", (request) => requests.add(request));
  page.on("requestfinished", (request) => requests.delete(request));
  page.on("requestfailed", (request) => requests.delete(request));
}

// The page is idle when the requests of the action are done and two more frames have passed with no new request.
async function idle(page) {
  const requests = inFlight.get(page);
  const twoFrames = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0)))));
  do {
    while (requests.size > 0) await new Promise((resolve) => setTimeout(resolve, 5));
    await twoFrames();
  } while (requests.size > 0);
}

async function measure({ browser, url }) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.dismiss());
  trackRequests(page);
  const session = await context.newCDPSession(page);
  await session.send("Performance.enable");
  await page.addInitScript(install);
  await page.goto(url);
  await page.locator(".mood-option:not(:disabled)").first().waitFor();
  await idle(page);
  if (cpu > 1) await session.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  const read = async () => Object.fromEntries((await session.send("Performance.getMetrics")).metrics.map(({ name, value }) => [name, value * 1000]));

  const results = [];
  for (const step of STEPS) {
    await step.before?.(page);
    await idle(page);
    const samples = [];
    for (let run = 0; run < runs + 2; run += 1) {
      const before = await read();
      const frame = await page.evaluate((action) => window.__act(action), step.act(run));
      if (step.settled) await page.locator(step.settled).first().waitFor();
      await idle(page);
      const after = await read();
      // The first two runs warm the code paths and are not counted.
      if (run >= 2) samples.push({ frame, task: after.TaskDuration - before.TaskDuration, script: after.ScriptDuration - before.ScriptDuration, layout: after.LayoutDuration + after.RecalcStyleDuration - before.LayoutDuration - before.RecalcStyleDuration });
      if (step.restore) {
        await page.evaluate((action) => window.__act(action), step.restore);
        await idle(page);
      }
    }
    await step.after?.(page);
    await idle(page);
    results.push({ name: step.name, frame: median(samples.map((sample) => sample.frame)), task: median(samples.map((sample) => sample.task)), script: median(samples.map((sample) => sample.script)), layout: median(samples.map((sample) => sample.layout)) });
  }
  await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await session.send("HeapProfiler.collectGarbage");
  const heap = (await read()).JSHeapUsedSize / 1000 / 1024;
  await context.close();
  if (errors.length) throw new Error(`Page errors on ${url}: ${errors.join("; ")}`);
  return { results, heap };
}

const browser = await launchBrowser();
try {
  const measured = [];
  for (const target of targets) measured.push(await measure({ browser, url: target.url }));
  const names = targets.map((target) => target.name);
  const note = `CPU ${cpu}x slower, median of ${runs} runs`;
  printTable({ title: `Event to next frame, ms (${note})`, targets: names, rows: STEPS.map((step, index) => ({ label: step.name, digits: 1, values: measured.map((result) => result.results[index].frame) })) });
  printTable({ title: `Main-thread time until idle, ms: script, style, layout, paint (${note})`, targets: names, rows: STEPS.map((step, index) => ({ label: step.name, digits: 1, values: measured.map((result) => result.results[index].task) })) });
  printTable({ title: `Script time until idle, ms (${note})`, targets: names, rows: STEPS.map((step, index) => ({ label: step.name, digits: 1, values: measured.map((result) => result.results[index].script) })) });
  printTable({ title: `Style and layout time until idle, ms (${note})`, targets: names, rows: STEPS.map((step, index) => ({ label: step.name, digits: 1, values: measured.map((result) => result.results[index].layout) })) });
  printTable({ title: "After all steps", targets: names, rows: [{ label: "JS heap, KB", values: measured.map((result) => result.heap) }] });
  if (process.env.BENCH_JSON) (await import("node:fs")).writeFileSync(process.env.BENCH_JSON, JSON.stringify(Object.fromEntries(targets.map((target, index) => [target.name, measured[index]])), null, 2));
} finally {
  await browser.close();
}
