import assert from "node:assert/strict";
import test from "node:test";
import { DaylioMemoryStore } from "../lib/memory-store.ts";
import { D1DaylioStore } from "../lib/server-store.ts";
import { MCP_PROTOCOL_VERSIONS, handleMcpHttp, handleMcpMessage } from "../lib/mcp/server.ts";
import { MAX_DAY_RANGE, MCP_TOOLS, checkArguments } from "../lib/mcp/tools.ts";
import { createTestDatabase } from "./helpers/d1-database.mjs";

const noStore = () => { throw new Error("This message must not need the journal."); };
const rpc = (method, params, id = 1) => ({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) });

async function callTool({ store, name, args }) {
  const response = await handleMcpMessage({ message: rpc("tools/call", { name, arguments: args }), getStore: () => store });
  assert.equal(response.error, undefined, JSON.stringify(response.error));
  const { content, isError } = response.result;
  assert.equal(content.length, 1);
  assert.equal(content[0].type, "text");
  return { isError: Boolean(isError), text: content[0].text };
}

async function tool({ store, name, args = {} }) {
  const { isError, text } = await callTool({ store, name, args });
  assert.equal(isError, false, text);
  return JSON.parse(text);
}

async function toolError({ store, name, args = {} }) {
  const { isError, text } = await callTool({ store, name, args });
  assert.equal(isError, true, `expected ${name} to fail, got ${text}`);
  return text;
}

test("initialize negotiates a protocol version and needs no journal access", async () => {
  for (const version of MCP_PROTOCOL_VERSIONS) {
    const response = await handleMcpMessage({ message: rpc("initialize", { protocolVersion: version, capabilities: {}, clientInfo: { name: "test", version: "0" } }), getStore: noStore });
    assert.equal(response.result.protocolVersion, version);
  }
  const future = await handleMcpMessage({ message: rpc("initialize", { protocolVersion: "2099-01-01" }), getStore: noStore });
  assert.equal(future.result.protocolVersion, MCP_PROTOCOL_VERSIONS[0]);
  assert.deepEqual(future.result.capabilities, { tools: { listChanged: false } });
  assert.equal(future.result.serverInfo.name, "daymark");
  assert.match(future.result.instructions, /get_overview first/);
  assert.deepEqual((await handleMcpMessage({ message: rpc("ping", undefined, "p"), getStore: noStore })), { jsonrpc: "2.0", id: "p", result: {} });
});

test("messages that need no reply get none, and bad ones get JSON-RPC errors", async () => {
  assert.equal(await handleMcpMessage({ message: { jsonrpc: "2.0", method: "notifications/initialized" }, getStore: noStore }), null);
  assert.equal(await handleMcpMessage({ message: { jsonrpc: "2.0", id: 7, result: {} }, getStore: noStore }), null, "a client's reply is ignored");
  assert.equal((await handleMcpMessage({ message: rpc("resources/list"), getStore: noStore })).error.code, -32601);
  assert.equal((await handleMcpMessage({ message: rpc("tools/call", { name: "drop_everything" }), getStore: noStore })).error.code, -32602);
  assert.equal((await handleMcpMessage({ message: { id: 1, method: "ping" }, getStore: noStore })).error.code, -32600);
  assert.equal((await handleMcpMessage({ message: "ping", getStore: noStore })).error.code, -32600);
});

test("tools/list describes six tools with strict input schemas", async () => {
  const { tools } = (await handleMcpMessage({ message: rpc("tools/list"), getStore: noStore })).result;
  assert.deepEqual(tools.map((entry) => entry.name), ["get_overview", "get_days", "summarize_mood", "summarize_activities", "get_goal_history", "save_day"]);
  for (const entry of tools) {
    assert.equal(entry.inputSchema.type, "object");
    assert.equal(entry.inputSchema.additionalProperties, false);
    for (const key of entry.inputSchema.required ?? []) assert.ok(key in entry.inputSchema.properties, `${entry.name}.${key}`);
    for (const [key, property] of Object.entries(entry.inputSchema.properties)) assert.ok(property.description, `${entry.name}.${key} needs a description`);
    assert.ok(entry.description.length > 60);
    assert.equal(entry.annotations.readOnlyHint, entry.name !== "save_day");
    assert.equal("run" in entry, false);
  }
});

test("arguments are checked against each tool's schema", () => {
  const schema = MCP_TOOLS.find((entry) => entry.name === "save_day").inputSchema;
  assert.deepEqual(checkArguments({ schema, args: { date: "2026-01-05", mood: 4, activities: [] } }), { date: "2026-01-05", mood: 4, activities: [] });
  assert.throws(() => checkArguments({ schema, args: { date: "2026-01-05", mood: "Good" } }), /Missing required argument "activities"/);
  assert.throws(() => checkArguments({ schema, args: { date: "2026-02-30", mood: "Good", activities: [] } }), /real calendar date/);
  assert.throws(() => checkArguments({ schema, args: { date: "2026-01-05", mood: 4.5, activities: [] } }), /"mood" must be a string or a integer/);
  assert.throws(() => checkArguments({ schema, args: { date: "2026-01-05", mood: 4, activities: ["a", 2] } }), /array of strings/);
  assert.throws(() => checkArguments({ schema, args: { date: "2026-01-05", mood: 4, activities: [], note: "x" } }), /Unknown argument "note"/);
  assert.throws(() => checkArguments({ schema, args: [] }), /must be an object/);
  const summary = MCP_TOOLS.find((entry) => entry.name === "summarize_mood").inputSchema;
  assert.throws(() => checkArguments({ schema: summary, args: { group_by: "decade" } }), /one of: month, year, week, weekday, none/);
  assert.deepEqual(checkArguments({ schema: summary, args: undefined }), {});
  assert.throws(() => checkArguments({ schema: MCP_TOOLS.find((entry) => entry.name === "summarize_activities").inputSchema, args: { min_days: 0 } }), /at least 1/);
});

test("the HTTP endpoint accepts only same-origin JSON POSTs", async () => {
  const url = "https://journal.example/api/mcp";
  const post = (body, headers = {}) => handleMcpHttp({ request: new Request(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) }), getStore: noStore });

  const ok = await post(rpc("ping"));
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get("content-type"), /application\/json/);
  assert.deepEqual(await ok.json(), { jsonrpc: "2.0", id: 1, result: {} });
  assert.equal((await post(rpc("ping"), { origin: "https://journal.example" })).status, 200);
  assert.equal((await post(rpc("ping"), { origin: "https://evil.example" })).status, 403);
  assert.equal((await post(rpc("ping"), { "mcp-protocol-version": "2025-06-18" })).status, 200);
  assert.equal((await post(rpc("ping"), { "mcp-protocol-version": "1999-01-01" })).status, 400);

  const notification = await post({ jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal(notification.status, 202);
  assert.equal(await notification.text(), "");

  const malformed = await post("{not json");
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, -32700);
  assert.equal((await handleMcpHttp({ request: new Request(url, { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" }), getStore: noStore })).status, 415);

  const get = await handleMcpHttp({ request: new Request(url), getStore: noStore });
  assert.equal(get.status, 405);
  assert.equal(get.headers.get("allow"), "POST");

  const batch = await post([rpc("ping", undefined, 1), { jsonrpc: "2.0", method: "notifications/initialized" }, rpc("ping", undefined, 2)]);
  assert.deepEqual((await batch.json()).map((response) => response.id), [1, 2]);
  assert.equal((await post([])).status, 400);
});

for (const kind of ["memory", "D1"]) {
  test(`${kind} tools add entries and report history by name`, async (t) => {
    const database = kind === "D1" ? createTestDatabase() : null;
    if (database) t.after(() => database.sqlite.close());
    const store = database ? new D1DaylioStore(database) : new DaylioMemoryStore();
    // A second "Walk" in another group, and a goal with no linked activity.
    await store.createActivity("Walk", "group-leisure", "hiking");
    await store.createGoal({ name: "Stretch", activityId: null, startDate: "2025-12-01" });

    // ----- save_day
    const save = (args) => tool({ store, name: "save_day", args });
    assert.match(await toolError({ store, name: "save_day", args: { date: "2026-01-05", mood: "Good", activities: ["Walk"] } }), /"Walk" matches more than one activity: "Walk \(Health\)", "Walk \(Leisure\)"/);
    assert.match(await toolError({ store, name: "save_day", args: { date: "2026-01-05", mood: "Good", activities: ["Juggling"] } }), /No activity is called "Juggling". Call get_overview/);
    assert.match(await toolError({ store, name: "save_day", args: { date: "2026-01-05", mood: "Fantastic", activities: [] } }), /Unknown mood "Fantastic"/);
    assert.match(await toolError({ store, name: "save_day", args: { date: "2026-01-05", mood: 9, activities: [] } }), /Unknown mood 9/);
    assert.equal((await store.listEntriesInRange("2026-01-01", "2026-01-31")).length, 0, "failed saves write nothing");

    if (database) database.queries.length = 0;
    assert.deepEqual(await save({ date: "2026-01-05", mood: "good", activities: ["walk (health)", "activity-gym"], completed_goals: ["Stretch"] }), {
      saved: "created",
      day: { date: "2026-01-05", weekday: "Mon", mood: "Good", score: 4, activities: ["Gym", "Walk (Health)"], goals_completed: ["Move your body", "Stretch"] },
    });
    // The free D1 plan allows 50 queries per request.
    if (database) assert.ok(database.queries.length <= 30, `${database.queries.length} queries for save_day`);
    await save({ date: "2026-01-06", mood: 5, activities: ["Gym", "Reading"] });
    await save({ date: "2026-01-10", mood: "Bad", activities: ["Meetings"] });
    await save({ date: "2026-02-02", mood: "mood-meh", activities: [] });
    await save({ date: "2025-12-31", mood: 1, activities: ["Sleep"] });

    assert.match(await toolError({ store, name: "save_day", args: { date: "2026-01-10", mood: "Rad", activities: [] } }), /2026-01-10 already has a saved entry.*replace_existing: true/);
    assert.equal((await store.listEntriesInRange("2026-01-10", "2026-01-10"))[0].moodId, "mood-bad", "a refused save changes nothing");
    const replaced = await save({ date: "2026-01-10", mood: "Bad", activities: ["Meetings", "Walk (Leisure)"], replace_existing: true });
    assert.equal(replaced.saved, "replaced");
    assert.deepEqual(replaced.day.activities, ["Meetings", "Walk (Leisure)"]);
    assert.equal((await save({ date: "2026-03-01", mood: 3, activities: [], replace_existing: true })).saved, "created");
    await store.deleteEntry("2026-03-01");

    // ----- get_overview
    const overview = await tool({ store, name: "get_overview" });
    assert.deepEqual(overview.history, { first_day: "2025-12-31", last_day: "2026-02-02", recorded_days: 5 });
    assert.equal(overview.week, "Monday–Sunday");
    assert.deepEqual(overview.moods.map((mood) => [mood.name, mood.score]), [["Rad", 5], ["Good", 4], ["Meh", 3], ["Bad", 2], ["Awful", 1]]);
    assert.deepEqual(overview.activity_groups.find((group) => group.group === "Health").activities.map((activity) => activity.name), ["Gym", "Walk (Health)", "Sleep"]);
    assert.ok(overview.activity_groups.find((group) => group.group === "Leisure").activities.some((activity) => activity.name === "Walk (Leisure)"));
    assert.deepEqual(overview.goals.map((goal) => [goal.name, goal.schedule, goal.linked_activity, goal.start_date]), [
      ["Move your body", "3 days per week", "Gym", null],
      ["Read", "Every day", "Reading", null],
      ["Stretch", "Every day", null, "2025-12-01"],
    ]);

    // ----- get_days
    const january = await tool({ store, name: "get_days", args: { start_date: "2026-01-01", end_date: "2026-01-31" } });
    assert.equal(january.days_in_range, 31);
    assert.equal(january.recorded_days, 3);
    assert.deepEqual(january.days.map((day) => [day.date, day.weekday, day.mood, day.score]), [["2026-01-05", "Mon", "Good", 4], ["2026-01-06", "Tue", "Rad", 5], ["2026-01-10", "Sat", "Bad", 2]]);
    assert.deepEqual(january.days[1], { date: "2026-01-06", weekday: "Tue", mood: "Rad", score: 5, activities: ["Gym", "Reading"], goals_completed: ["Move your body", "Read"] });
    assert.match(await toolError({ store, name: "get_days", args: { start_date: "2025-01-01", end_date: "2026-01-02" } }), new RegExp(`at most ${MAX_DAY_RANGE} days per call`));
    assert.match(await toolError({ store, name: "get_days", args: { start_date: "2026-02-01", end_date: "2026-01-01" } }), /must not be after/);
    assert.match(await toolError({ store, name: "get_days", args: { start_date: "2026-01-01" } }), /Missing required argument "end_date"/);

    // ----- summarize_mood
    const byMonth = await tool({ store, name: "summarize_mood" });
    assert.deepEqual([byMonth.start_date, byMonth.end_date, byMonth.recorded_days, byMonth.mean_mood, byMonth.good_share, byMonth.group_by], ["2025-12-31", "2026-02-02", 5, 3, 0.4, "month"]);
    assert.deepEqual(byMonth.distribution, { Awful: 1, Bad: 1, Meh: 1, Good: 1, Rad: 1 });
    assert.deepEqual(byMonth.periods.map((period) => [period.period, period.recorded_days, period.mean_mood]), [["2025-12", 1, 1], ["2026-01", 3, 3.67], ["2026-02", 1, 3]]);
    const byWeekday = await tool({ store, name: "summarize_mood", args: { group_by: "weekday" } });
    assert.deepEqual(byWeekday.periods.map((period) => [period.period, period.recorded_days]), [["Monday", 2], ["Tuesday", 1], ["Wednesday", 1], ["Saturday", 1]]);
    const byWeek = await tool({ store, name: "summarize_mood", args: { group_by: "week", start_date: "2026-01-01", end_date: "2026-01-31" } });
    assert.deepEqual(byWeek.periods.map((period) => [period.period, period.week_end, period.recorded_days, period.mean_mood]), [["2026-01-05", "2026-01-11", 3, 3.67]]);
    const whole = await tool({ store, name: "summarize_mood", args: { group_by: "none", start_date: "2026-01-01" } });
    assert.deepEqual([whole.recorded_days, whole.periods.length, whole.end_date], [4, 0, "2026-02-02"]);
    assert.deepEqual((await tool({ store, name: "summarize_mood", args: { group_by: "year" } })).periods.map((period) => period.period), ["2025", "2026"]);

    // ----- summarize_activities
    const activities = await tool({ store, name: "summarize_activities" });
    assert.equal(activities.recorded_days, 5);
    const gym = activities.activities.find((row) => row.activity === "Gym");
    assert.deepEqual(gym, { activity: "Gym", group: "Health", days: 2, share_of_days: 0.4, mean_mood_with: 4.5, mean_mood_without: 2, difference: 2.5, small_sample: true });
    assert.deepEqual(activities.activities.slice(0, 2).map((row) => [row.activity, row.difference, row.days]), [["Gym", 2.5, 2], ["Reading", 2.5, 1]], "ranked by difference, then by days");
    assert.equal(activities.activities.every((row) => row.days >= 1), true, "activities never recorded are left out");
    assert.equal(activities.activities.length, 6);
    assert.deepEqual((await tool({ store, name: "summarize_activities", args: { min_days: 2 } })).activities.map((row) => row.activity), ["Gym"]);

    // ----- get_goal_history
    const goal = await tool({ store, name: "get_goal_history", args: { goal: "move your body", start_date: "2026-01-01", end_date: "2026-01-31", today: "2026-01-20" } });
    assert.equal(goal.goal.id, "goal-move");
    assert.deepEqual(goal.completed_dates, ["2026-01-05", "2026-01-06"]);
    assert.deepEqual(goal.weeks.map((week) => [week.week_start, week.status, week.completed_days, week.expected_days]), [
      ["2025-12-29", "not_accomplished", 0, 3],
      ["2026-01-05", "not_accomplished", 2, 3],
      ["2026-01-12", "not_accomplished", 0, 3],
      ["2026-01-19", "in_progress", 0, 3],
      ["2026-01-26", "upcoming", 0, 3],
    ]);
    assert.deepEqual(goal.week_results, { accomplished: 0, not_accomplished: 3, in_progress: 1, upcoming: 1 });
    assert.match(await toolError({ store, name: "get_goal_history", args: { goal: "Fly", start_date: "2026-01-01", end_date: "2026-01-31" } }), /No goal is called "Fly"/);
  });
}
