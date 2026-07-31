import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const wrangler = join(root, "node_modules/wrangler/bin/wrangler.js");
const port = 8799;
const baseUrl = `http://localhost:${port}`;

function run(command, args, cwd = root) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [command, ...args], { cwd, env: { ...process.env, CI: "1", NO_COLOR: "1" }, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(output) : reject(new Error(`${command} exited ${code}\n${output}`)));
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Wrangler is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for Wrangler.");
}

async function json(path, init) {
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json();
  return { response, body };
}

test("Wrangler-backed API covers persistence, catalog, calendar, pagination, import, and export", async (t) => {
  const persistence = await mkdtemp(join(tmpdir(), "daymark-api-"));
  let server;
  t.after(async () => {
    if (server && !server.killed) server.kill("SIGTERM");
    await rm(persistence, { recursive: true, force: true });
  });

  await run(wrangler, ["d1", "migrations", "apply", "daylio-clone", "--local", "--config", "wrangler.jsonc", "--persist-to", persistence]);
  server = spawn(process.execPath, [wrangler, "dev", "--config", "dist/server/wrangler.json", "--local", "--persist-to", persistence, "--port", String(port)], { cwd: root, env: { ...process.env, CI: "1", NO_COLOR: "1" }, stdio: ["ignore", "pipe", "pipe"] });
  await waitForServer();

  const health = await json("/api/health");
  assert.equal(health.response.status, 200);
  assert.deepEqual(health.body, { ok: true });

  const bootstrap = await json("/api/bootstrap");
  assert.equal(bootstrap.response.status, 200);
  assert.equal(bootstrap.body.moods.length, 5);
  assert.equal(bootstrap.body.groups.length, 5);
  assert.equal(bootstrap.body.activities.length, 12);
  assert.equal(bootstrap.body.goals.length, 2);

  const group = await json("/api/catalog", { method: "POST", body: JSON.stringify({ kind: "group", name: "Testing" }) });
  assert.equal(group.response.status, 201);
  const activity = await json("/api/catalog", { method: "POST", body: JSON.stringify({ kind: "activity", name: "Test reading", groupId: group.body.group.id }) });
  assert.equal(activity.response.status, 201);
  assert.equal(activity.body.activity.icon, "menu_book");
  const goal = await json("/api/catalog", { method: "POST", body: JSON.stringify({ kind: "goal", name: "Test goal", activityId: activity.body.activity.id, scheduleType: "daily" }) });
  assert.equal(goal.response.status, 201);

  const rename = await json(`/api/catalog/group/${group.body.group.id}`, { method: "PATCH", body: JSON.stringify({ name: "Renamed", sortOrder: 0 }) });
  assert.equal(rename.body.group.name, "Renamed");
  const archivedGroup = await json(`/api/catalog/group/${group.body.group.id}`, { method: "PATCH", body: JSON.stringify({ archived: true }) });
  assert.equal(archivedGroup.body.group.archived, true);
  await json(`/api/catalog/group/${group.body.group.id}`, { method: "PATCH", body: JSON.stringify({ archived: false }) });
  const updateActivity = await json(`/api/catalog/activity/${activity.body.activity.id}`, { method: "PATCH", body: JSON.stringify({ name: "Test book", icon: "menu_book", groupId: group.body.group.id }) });
  assert.equal(updateActivity.body.activity.name, "Test book");
  const archivedActivity = await json(`/api/catalog/activity/${activity.body.activity.id}`, { method: "PATCH", body: JSON.stringify({ archived: true }) });
  assert.equal(archivedActivity.body.activity.archived, true);
  await json(`/api/catalog/activity/${activity.body.activity.id}`, { method: "PATCH", body: JSON.stringify({ archived: false }) });
  const updateGoal = await json(`/api/catalog/goal/${goal.body.goal.id}`, { method: "PATCH", body: JSON.stringify({ scheduleType: "times_per_week", targetPerWeek: 2 }) });
  assert.equal(updateGoal.body.goal.scheduleType, "times_per_week");
  const archivedGoal = await json(`/api/catalog/goal/${goal.body.goal.id}`, { method: "PATCH", body: JSON.stringify({ archived: true }) });
  assert.equal(archivedGoal.body.goal.archived, true);
  await json(`/api/catalog/goal/${goal.body.goal.id}`, { method: "PATCH", body: JSON.stringify({ archived: false }) });

  const saved = await json("/api/entries/2026-02-03", { method: "PUT", body: JSON.stringify({ moodId: "mood-good", activityIds: [activity.body.activity.id], completedGoalIds: [goal.body.goal.id], localTime: "21:30" }) });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.body.entry.activityIds.length, 1);
  const savedOlder = await json("/api/entries/2026-02-02", { method: "PUT", body: JSON.stringify({ moodId: "mood-meh", activityIds: [], completedGoalIds: [], localTime: "20:00" }) });
  assert.equal(savedOlder.response.status, 200);
  const loaded = await json("/api/entries/2026-02-03");
  assert.equal(loaded.body.entry.localTime, "21:30");
  const calendar = await json("/api/calendar?month=2026-02");
  assert.deepEqual(calendar.body.dates, ["2026-02-02", "2026-02-03"]);

  const page = await json("/api/entries?limit=1&offset=0");
  assert.equal(page.response.status, 200);
  assert.equal(page.body.entries.length, 1);
  assert.equal(page.body.hasMore, true);
  const deleted = await json("/api/entries/2026-02-03?expectedVersion=1", { method: "DELETE" });
  assert.equal(deleted.response.status, 200);
  const deletedOlder = await json("/api/entries/2026-02-02?expectedVersion=1", { method: "DELETE" });
  assert.equal(deletedOlder.response.status, 200);
  const missing = await json("/api/entries/2026-02-03");
  assert.equal(missing.response.status, 404);

  const importPayload = {
    sourceSystem: "daylio",
    sourceSha256: "integration-fixture",
    moods: [{ sourceId: "1", name: "rad", score: 5 }, { sourceId: "2", name: "good", score: 4 }, { sourceId: "3", name: "meh", score: 3 }, { sourceId: "4", name: "bad", score: 2 }, { sourceId: "5", name: "awful", score: 1 }],
    groups: [{ sourceId: "1", name: "Imported", sortOrder: 0 }],
    activities: [{ sourceId: "1", groupSourceId: "1", name: "Imported book", sourceIconId: "123", sortOrder: 0, sourceState: 0 }],
    goals: [{ sourceId: "1", activitySourceId: "-1", name: "Unlinked goal", scheduleType: "daily", sortOrder: 0, sourceState: 1 }],
    entries: [{ sourceId: "1", logicalDate: "2026-02-04", localTime: "20:00", moodSourceId: "2", activitySourceIds: ["1"] }],
    completions: [{ sourceId: "1", goalSourceId: "1", logicalDate: "2026-02-04", localTime: "20:00:00" }],
  };
  const imported = await json("/api/import", { method: "POST", body: JSON.stringify(importPayload) });
  assert.equal(imported.response.status, 200);
  const importedEntry = await json("/api/entries/2026-02-04");
  assert.equal(importedEntry.body.entry.completedGoalIds.length, 1);
  const exported = await json("/api/export");
  assert.equal(exported.body.formatVersion, 1);
  assert.equal(exported.body.tables.import_runs.length, 1);
  assert.equal(exported.body.tables.import_runs[0].status, "completed");
});
