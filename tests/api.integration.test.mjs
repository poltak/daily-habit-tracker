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
  const rawBody = await response.text();
  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw new Error(`Expected JSON for ${init?.method ?? "GET"} ${path}; received HTTP ${response.status}: ${rawBody}`);
  }
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
  // Wrangler emits request and inspector logs while the test runs. Drain both
  // pipes so the child cannot block and restart its worker on a full buffer.
  server.stdout.on("data", () => {});
  server.stderr.on("data", () => {});
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

  const selectionDate = "2026-01-11";
  const standaloneMood = await json(`/api/day-selections/${selectionDate}/mood`, { method: "PUT", body: JSON.stringify({ moodId: "mood-rad" }) });
  assert.equal(standaloneMood.response.status, 200);
  assert.deepEqual(standaloneMood.body.selection, { logicalDate: selectionDate, moodId: "mood-rad" });
  const standaloneMoodAgain = await json(`/api/day-selections/${selectionDate}/mood`, { method: "PUT", body: JSON.stringify({ moodId: "mood-rad" }) });
  assert.equal(standaloneMoodAgain.response.status, 200);
  const standaloneActivity = await json(`/api/day-selections/${selectionDate}/activities/activity-gym`, { method: "PUT", body: JSON.stringify({ selected: true }) });
  assert.equal(standaloneActivity.response.status, 200);
  const standaloneActivityAgain = await json(`/api/day-selections/${selectionDate}/activities/activity-gym`, { method: "PUT", body: JSON.stringify({ selected: true }) });
  assert.equal(standaloneActivityAgain.response.status, 200);
  const standaloneState = await json(`/api/entries/${selectionDate}`);
  assert.equal(standaloneState.response.status, 404);
  assert.equal(standaloneState.body.entry, null);
  assert.equal(standaloneState.body.daySelections.moodId, "mood-rad");
  assert.deepEqual(standaloneState.body.daySelections.activityIds, ["activity-gym"]);
  const standaloneOff = await json(`/api/day-selections/${selectionDate}/activities/activity-gym`, { method: "PUT", body: JSON.stringify({ selected: false }) });
  assert.equal(standaloneOff.response.status, 200);
  const standaloneOffAgain = await json(`/api/day-selections/${selectionDate}/activities/activity-gym`, { method: "PUT", body: JSON.stringify({ selected: false }) });
  assert.equal(standaloneOffAgain.response.status, 200);
  const standaloneEmpty = await json(`/api/entries/${selectionDate}`);
  assert.deepEqual(standaloneEmpty.body.daySelections.activityIds, []);

  const linkedGoalDate = "2026-01-13";
  const linkedGoalOn = await json(`/api/goal-completions/${linkedGoalDate}/goal-move`, { method: "PUT", body: JSON.stringify({ completed: true }) });
  assert.equal(linkedGoalOn.response.status, 200);
  assert.deepEqual(linkedGoalOn.body.selection, { logicalDate: linkedGoalDate, activityId: "activity-gym", selected: true });
  assert.deepEqual(linkedGoalOn.body.affectedGoalCompletions.map((item) => item.goalId), ["goal-move"]);
  const linkedGoalState = await json(`/api/entries/${linkedGoalDate}`);
  assert.equal(linkedGoalState.response.status, 404);
  assert.deepEqual(linkedGoalState.body.completedGoalIds, ["goal-move"]);
  assert.deepEqual(linkedGoalState.body.daySelections.activityIds, ["activity-gym"]);
  const linkedGoalOff = await json(`/api/goal-completions/${linkedGoalDate}/goal-move`, { method: "PUT", body: JSON.stringify({ completed: false }) });
  assert.equal(linkedGoalOff.response.status, 200);
  assert.equal(linkedGoalOff.body.selection.selected, false);
  const linkedGoalEmpty = await json(`/api/entries/${linkedGoalDate}`);
  assert.deepEqual(linkedGoalEmpty.body.completedGoalIds, []);
  assert.deepEqual(linkedGoalEmpty.body.daySelections.activityIds, []);

  const invalidMoodSelection = await json(`/api/day-selections/${selectionDate}/mood`, { method: "PUT", body: JSON.stringify({ moodId: "mood-missing" }) });
  assert.equal(invalidMoodSelection.response.status, 400);
  const invalidActivitySelection = await json(`/api/day-selections/${selectionDate}/activities/activity-missing`, { method: "PUT", body: JSON.stringify({ selected: true }) });
  assert.equal(invalidActivitySelection.response.status, 400);
  const invalidActivityBody = await json(`/api/day-selections/${selectionDate}/activities/activity-gym`, { method: "PUT", body: JSON.stringify({ selected: "yes" }) });
  assert.equal(invalidActivityBody.response.status, 400);
  const invalidSelectionDate = await json("/api/day-selections/not-a-date/mood", { method: "PUT", body: JSON.stringify({ moodId: "mood-good" }) });
  assert.equal(invalidSelectionDate.response.status, 400);

  const overrideDate = "2026-01-12";
  const initialOverrideEntry = await json(`/api/entries/${overrideDate}`, { method: "PUT", body: JSON.stringify({ moodId: "mood-good", activityIds: ["activity-gym", "activity-walk"], completedGoalIds: [], localTime: "20:00" }) });
  assert.equal(initialOverrideEntry.response.status, 200);
  await json(`/api/day-selections/${overrideDate}/mood`, { method: "PUT", body: JSON.stringify({ moodId: "mood-rad" }) });
  await json(`/api/day-selections/${overrideDate}/activities/activity-walk`, { method: "PUT", body: JSON.stringify({ selected: false }) });
  await json(`/api/day-selections/${overrideDate}/activities/activity-sleep`, { method: "PUT", body: JSON.stringify({ selected: true }) });
  const effectiveOverride = await json(`/api/entries/${overrideDate}`);
  assert.equal(effectiveOverride.body.entry.moodId, "mood-rad");
  assert.deepEqual(effectiveOverride.body.entry.activityIds, ["activity-gym", "activity-sleep"]);
  const overrideCalendar = await json("/api/calendar?month=2026-01");
  assert.equal(overrideCalendar.response.status, 200);
  assert.equal(overrideCalendar.body.days.find((day) => day.logicalDate === overrideDate).moodId, "mood-rad");
  const finalizedOverride = await json(`/api/entries/${overrideDate}`, { method: "PUT", body: JSON.stringify({ moodId: "mood-good", activityIds: ["activity-gym", "activity-walk"], completedGoalIds: [], localTime: "20:00" }) });
  assert.equal(finalizedOverride.response.status, 200);
  assert.equal(finalizedOverride.body.entry.moodId, "mood-rad");
  assert.deepEqual(finalizedOverride.body.entry.activityIds, ["activity-gym", "activity-sleep"]);
  const finalizedOverrideState = await json(`/api/entries/${overrideDate}`);
  assert.equal(finalizedOverrideState.body.daySelections.moodOverride, false);
  assert.deepEqual(finalizedOverrideState.body.daySelections.activityOverrideIds, []);

  const standaloneDate = "2026-01-10";
  const standaloneComplete = await json(`/api/goal-completions/${standaloneDate}/goal-read`, { method: "PUT", body: JSON.stringify({ completed: true }) });
  assert.equal(standaloneComplete.response.status, 200);
  assert.deepEqual(standaloneComplete.body.completion, { goalId: "goal-read", logicalDate: standaloneDate, completed: true });
  const standaloneCompleteAgain = await json(`/api/goal-completions/${standaloneDate}/goal-read`, { method: "PUT", body: JSON.stringify({ completed: true }) });
  assert.equal(standaloneCompleteAgain.response.status, 200);
  const standaloneBeforeEntry = await json(`/api/entries/${standaloneDate}`);
  assert.equal(standaloneBeforeEntry.response.status, 404);
  assert.deepEqual(standaloneBeforeEntry.body.completedGoalIds, ["goal-read"]);
  const entryAfterStandaloneToggle = await json(`/api/entries/${standaloneDate}`, { method: "PUT", body: JSON.stringify({ moodId: "mood-good", activityIds: [], completedGoalIds: ["goal-move"], localTime: "20:00" }) });
  assert.equal(entryAfterStandaloneToggle.response.status, 200);
  assert.deepEqual(entryAfterStandaloneToggle.body.entry.completedGoalIds, ["goal-read"]);
  const standaloneUncomplete = await json(`/api/goal-completions/${standaloneDate}/goal-read`, { method: "PUT", body: JSON.stringify({ completed: false }) });
  assert.equal(standaloneUncomplete.response.status, 200);
  const standaloneUncompleteAgain = await json(`/api/goal-completions/${standaloneDate}/goal-read`, { method: "PUT", body: JSON.stringify({ completed: false }) });
  assert.equal(standaloneUncompleteAgain.response.status, 200);
  const standaloneAfterUncomplete = await json(`/api/entries/${standaloneDate}`);
  assert.deepEqual(standaloneAfterUncomplete.body.entry.completedGoalIds, []);
  const staleGoalSave = await json(`/api/entries/${standaloneDate}`, { method: "PUT", body: JSON.stringify({ moodId: "mood-rad", activityIds: [], completedGoalIds: ["goal-read"], localTime: "21:00" }) });
  assert.equal(staleGoalSave.response.status, 200);
  assert.deepEqual(staleGoalSave.body.entry.completedGoalIds, []);
  const invalidGoalToggle = await json(`/api/goal-completions/${standaloneDate}/goal-missing`, { method: "PUT", body: JSON.stringify({ completed: true }) });
  assert.equal(invalidGoalToggle.response.status, 400);
  const invalidDateToggle = await json("/api/goal-completions/not-a-date/goal-read", { method: "PUT", body: JSON.stringify({ completed: true }) });
  assert.equal(invalidDateToggle.response.status, 400);

  const malformedEntry = await json("/api/entries/2026-02-01", { method: "PUT", body: JSON.stringify({ moodId: "mood-good", activityIds: null, completedGoalIds: [], localTime: "20:00" }) });
  assert.equal(malformedEntry.response.status, 400);
  assert.equal(malformedEntry.body.error, "Activity IDs must be an array of strings.");
  const invalidTime = await json("/api/entries/2026-02-01", { method: "PUT", body: JSON.stringify({ moodId: "mood-good", activityIds: [], completedGoalIds: [], localTime: "25:00" }) });
  assert.equal(invalidTime.response.status, 400);
  assert.equal(invalidTime.body.error, "Choose a valid entry time.");
  const unknownMood = await json("/api/entries/2026-02-01", { method: "PUT", body: JSON.stringify({ moodId: "mood-missing", activityIds: [], completedGoalIds: [], localTime: "20:00" }) });
  assert.equal(unknownMood.response.status, 400);
  assert.equal(unknownMood.body.error, "Choose one of the five moods.");
  const unknownActivity = await json("/api/entries/2026-02-01", { method: "PUT", body: JSON.stringify({ moodId: "mood-good", activityIds: ["activity-missing"], completedGoalIds: [], localTime: "20:00" }) });
  assert.equal(unknownActivity.response.status, 400);
  assert.equal(unknownActivity.body.error, "One activity is no longer available.");
  const unknownGoal = await json("/api/entries/2026-02-01", { method: "PUT", body: JSON.stringify({ moodId: "mood-good", activityIds: [], completedGoalIds: ["goal-missing"], localTime: "20:00" }) });
  assert.equal(unknownGoal.response.status, 400);
  assert.equal(unknownGoal.body.error, "One goal is no longer available.");

  const group = await json("/api/catalog", { method: "POST", body: JSON.stringify({ kind: "group", name: "Testing" }) });
  assert.equal(group.response.status, 201);
  const activity = await json("/api/catalog", { method: "POST", body: JSON.stringify({ kind: "activity", name: "Test reading", groupId: group.body.group.id }) });
  assert.equal(activity.response.status, 201);
  assert.equal(activity.body.activity.icon, "menu_book");
  const goal = await json("/api/catalog", { method: "POST", body: JSON.stringify({ kind: "goal", name: "Test goal", activityId: activity.body.activity.id, scheduleType: "daily" }) });
  assert.equal(goal.response.status, 201);
  const sharedGoalA = await json("/api/catalog", { method: "POST", body: JSON.stringify({ kind: "goal", name: "Shared goal A", activityId: "activity-gym", scheduleType: "daily" }) });
  assert.equal(sharedGoalA.response.status, 201);
  const sharedGoalB = await json("/api/catalog", { method: "POST", body: JSON.stringify({ kind: "goal", name: "Shared goal B", activityId: "activity-gym", scheduleType: "daily" }) });
  assert.equal(sharedGoalB.response.status, 201);
  const unlinkedGoal = await json("/api/catalog", { method: "POST", body: JSON.stringify({ kind: "goal", name: "Unlinked goal", activityId: null, scheduleType: "daily" }) });
  assert.equal(unlinkedGoal.response.status, 201);
  assert.equal(unlinkedGoal.body.goal.activityId, null);
  const relinkableGoal = await json("/api/catalog", { method: "POST", body: JSON.stringify({ kind: "goal", name: "Relinkable goal", activityId: activity.body.activity.id, scheduleType: "daily" }) });
  assert.equal(relinkableGoal.response.status, 201);
  const unlinkedPatch = await json(`/api/catalog/goal/${relinkableGoal.body.goal.id}`, { method: "PATCH", body: JSON.stringify({ activityId: null }) });
  assert.equal(unlinkedPatch.response.status, 200);
  assert.equal(unlinkedPatch.body.goal.activityId, null);
  const invalidGoalLink = await json(`/api/catalog/goal/${relinkableGoal.body.goal.id}`, { method: "PATCH", body: JSON.stringify({ activityId: "activity-missing" }) });
  assert.equal(invalidGoalLink.response.status, 400);
  const relinkedGoal = await json(`/api/catalog/goal/${relinkableGoal.body.goal.id}`, { method: "PATCH", body: JSON.stringify({ activityId: activity.body.activity.id }) });
  assert.equal(relinkedGoal.response.status, 200);
  assert.equal(relinkedGoal.body.goal.activityId, activity.body.activity.id);

  const archivedSharedGoal = await json("/api/catalog", { method: "POST", body: JSON.stringify({ kind: "goal", name: "Archived shared goal", activityId: "activity-gym", scheduleType: "daily" }) });
  assert.equal(archivedSharedGoal.response.status, 201);
  const archivedDate = "2026-02-07";
  const archivedOn = await json(`/api/goal-completions/${archivedDate}/${archivedSharedGoal.body.goal.id}`, { method: "PUT", body: JSON.stringify({ completed: true }) });
  assert.equal(archivedOn.response.status, 200);
  const archived = await json(`/api/catalog/goal/${archivedSharedGoal.body.goal.id}`, { method: "PATCH", body: JSON.stringify({ archived: true }) });
  assert.equal(archived.response.status, 200);
  assert.equal(archived.body.goal.archived, true);
  const archivedActivityOff = await json(`/api/day-selections/${archivedDate}/activities/activity-gym`, { method: "PUT", body: JSON.stringify({ selected: false }) });
  assert.equal(archivedActivityOff.response.status, 200);
  assert.equal(archivedActivityOff.body.affectedGoalCompletions.some((item) => item.goalId === archivedSharedGoal.body.goal.id), false);
  const archivedState = await json(`/api/entries/${archivedDate}`);
  assert.deepEqual(archivedState.body.completedGoalIds, [archivedSharedGoal.body.goal.id]);
  assert.deepEqual(archivedState.body.daySelections.activityIds, []);

  const sharedDate = "2026-02-05";
  const sharedOn = await json(`/api/day-selections/${sharedDate}/activities/activity-gym`, { method: "PUT", body: JSON.stringify({ selected: true }) });
  assert.equal(sharedOn.response.status, 200);
  assert.deepEqual(sharedOn.body.affectedGoalCompletions.map((item) => item.goalId).sort(), ["goal-move", sharedGoalA.body.goal.id, sharedGoalB.body.goal.id].sort());
  const sharedOnState = await json(`/api/entries/${sharedDate}`);
  assert.deepEqual(sharedOnState.body.completedGoalIds.sort(), ["goal-move", sharedGoalA.body.goal.id, sharedGoalB.body.goal.id].sort());
  assert.deepEqual(sharedOnState.body.daySelections.activityIds, ["activity-gym"]);
  const sharedOff = await json(`/api/day-selections/${sharedDate}/activities/activity-gym`, { method: "PUT", body: JSON.stringify({ selected: false }) });
  assert.equal(sharedOff.response.status, 200);
  assert.deepEqual(sharedOff.body.affectedGoalCompletions.map((item) => item.goalId).sort(), ["goal-move", sharedGoalA.body.goal.id, sharedGoalB.body.goal.id].sort());
  const sharedOffState = await json(`/api/entries/${sharedDate}`);
  assert.deepEqual(sharedOffState.body.completedGoalIds, []);
  assert.deepEqual(sharedOffState.body.daySelections.activityIds, []);

  const unlinkedDate = "2026-02-06";
  const unlinkedOn = await json(`/api/goal-completions/${unlinkedDate}/${unlinkedGoal.body.goal.id}`, { method: "PUT", body: JSON.stringify({ completed: true }) });
  assert.equal(unlinkedOn.response.status, 200);
  assert.equal(unlinkedOn.body.selection, undefined);
  assert.deepEqual(unlinkedOn.body.affectedActivitySelections, []);
  const unlinkedState = await json(`/api/entries/${unlinkedDate}`);
  assert.deepEqual(unlinkedState.body.completedGoalIds, [unlinkedGoal.body.goal.id]);
  assert.deepEqual(unlinkedState.body.daySelections.activityIds, []);
  const unlinkedOff = await json(`/api/goal-completions/${unlinkedDate}/${unlinkedGoal.body.goal.id}`, { method: "PUT", body: JSON.stringify({ completed: false }) });
  assert.equal(unlinkedOff.response.status, 200);
  assert.deepEqual((await json(`/api/entries/${unlinkedDate}`)).body.completedGoalIds, []);

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
  assert.equal(updateGoal.body.goal.repeatType, "weekly");
  assert.equal(updateGoal.body.goal.targetPerWeek, 2);
  const configureGoal = await json(`/api/catalog/goal/${goal.body.goal.id}`, { method: "PATCH", body: JSON.stringify({ repeatType: "daily", weekdaysMask: 0b00111110, materialIcon: "star" }) });
  assert.equal(configureGoal.response.status, 200);
  assert.equal(configureGoal.body.goal.scheduleType, "weekdays");
  assert.equal(configureGoal.body.goal.repeatType, "daily");
  assert.equal(configureGoal.body.goal.weekdaysMask, 0b00111110);
  assert.equal(configureGoal.body.goal.materialIcon, "star");
  const archivedGoal = await json(`/api/catalog/goal/${goal.body.goal.id}`, { method: "PATCH", body: JSON.stringify({ archived: true }) });
  assert.equal(archivedGoal.body.goal.archived, true);
  await json(`/api/catalog/goal/${goal.body.goal.id}`, { method: "PATCH", body: JSON.stringify({ archived: false }) });

  const savedGoal = await json(`/api/goal-completions/2026-02-03/${goal.body.goal.id}`, { method: "PUT", body: JSON.stringify({ completed: true }) });
  assert.equal(savedGoal.response.status, 200);
  const missingGoalHistoryAsOf = await json(`/api/goals/${goal.body.goal.id}/history?month=2026-02`);
  assert.equal(missingGoalHistoryAsOf.response.status, 400);
  const goalHistory = await json(`/api/goals/${goal.body.goal.id}/history?month=2026-02&asOf=2026-02-28`);
  assert.equal(goalHistory.response.status, 200);
  assert.equal(goalHistory.body.goal.materialIcon, "star");
  assert.equal(goalHistory.body.days.length, 28);
  assert.equal(goalHistory.body.days.find((day) => day.logicalDate === "2026-02-03").completed, true);
  assert.equal(goalHistory.body.days.find((day) => day.logicalDate === "2026-02-01").scheduled, false);
  assert.ok(goalHistory.body.weeks.some((week) => week.status === "not_accomplished"));
  const saved = await json("/api/entries/2026-02-03", { method: "PUT", body: JSON.stringify({ moodId: "mood-good", activityIds: [activity.body.activity.id], completedGoalIds: ["goal-move"], localTime: "21:30" }) });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.body.entry.activityIds.length, 1);
  const savedOlder = await json("/api/entries/2026-02-02", { method: "PUT", body: JSON.stringify({ moodId: "mood-meh", activityIds: [], completedGoalIds: [], localTime: "20:00" }) });
  assert.equal(savedOlder.response.status, 200);
  const loaded = await json("/api/entries/2026-02-03");
  assert.equal(loaded.body.entry.localTime, "21:30");
  const calendar = await json("/api/calendar?month=2026-02");
  assert.deepEqual(calendar.body.dates, ["2026-02-02", "2026-02-03"]);
  assert.deepEqual(calendar.body.days, [
    { logicalDate: "2026-02-02", moodId: "mood-meh" },
    { logicalDate: "2026-02-03", moodId: "mood-good" },
  ]);

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

  const recreated = await json("/api/entries/2026-02-03", { method: "PUT", body: JSON.stringify({ moodId: "mood-rad", activityIds: [activity.body.activity.id], completedGoalIds: [goal.body.goal.id], localTime: "22:00" }) });
  assert.equal(recreated.response.status, 200);
  assert.equal(recreated.body.entry.id, saved.body.entry.id);
  assert.equal(recreated.body.entry.version, 1);
  assert.deepEqual(recreated.body.entry.activityIds, [activity.body.activity.id]);
  assert.deepEqual(recreated.body.entry.completedGoalIds.sort(), [goal.body.goal.id, relinkableGoal.body.goal.id].sort());
  const reloaded = await json("/api/entries/2026-02-03");
  assert.equal(reloaded.response.status, 200);
  assert.deepEqual(reloaded.body.entry.activityIds, [activity.body.activity.id]);
  assert.deepEqual(reloaded.body.entry.completedGoalIds.sort(), [goal.body.goal.id, relinkableGoal.body.goal.id].sort());

  const importPayload = {
    sourceSystem: "daylio",
    sourceSha256: "integration-fixture",
    moods: [{ sourceId: "1", name: "rad", score: 5 }, { sourceId: "2", name: "good", score: 4 }, { sourceId: "3", name: "meh", score: 3 }, { sourceId: "4", name: "bad", score: 2 }, { sourceId: "5", name: "awful", score: 1 }],
    groups: [{ sourceId: "1", name: "Imported", sortOrder: 0 }],
    activities: [{ sourceId: "1", groupSourceId: "1", name: "Imported book", sourceIconId: "123", sortOrder: 0, sourceState: 0 }],
    goals: [{ sourceId: "1", activitySourceId: null, name: "Unlinked goal", scheduleType: "daily", sortOrder: 0, sourceState: 1 }],
    entries: [{ sourceId: "1", logicalDate: "2026-02-04", localTime: "20:00", moodSourceId: "2", activitySourceIds: ["1"] }],
    completions: [{ sourceId: "1", goalSourceId: "1", logicalDate: "2026-02-04", localTime: "20:00:00" }],
  };
  const imported = await json("/api/import", { method: "POST", body: JSON.stringify(importPayload) });
  assert.equal(imported.response.status, 200);
  assert.deepEqual(Object.fromEntries(imported.body.bootstrap.moods.filter((item) => item.id.startsWith("mood-")).map((item) => [item.id, item.emoji])), {
    "mood-rad": "😄",
    "mood-good": "🙂",
    "mood-meh": "😐",
    "mood-bad": "☹️",
    "mood-awful": "😫",
  });
  assert.equal(imported.body.bootstrap.goals.find((item) => item.id === "daylio-goal-1").activityId, null);
  const importedEntry = await json("/api/entries/2026-02-04");
  assert.equal(importedEntry.body.entry.completedGoalIds.length, 1);
  const exported = await json("/api/export");
  assert.equal(exported.body.formatVersion, 1);
  assert.equal(exported.body.tables.import_runs.length, 1);
  assert.equal(exported.body.tables.import_runs[0].status, "completed");
  assert.equal(exported.body.tables.goals.find((item) => item.id === "daylio-goal-1").activity_id, null);
  assert.equal(exported.body.tables.activities.some((item) => item.id.includes("unlinked-goal")), false);
});
