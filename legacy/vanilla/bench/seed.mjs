// Fills a local server with synthetic journal data, so both runtimes can be measured with the same realistic load.
// Usage: node vanilla/bench/seed.mjs http://localhost:3101
// The data is the same on each run. It is written only to a local development server.
import assert from "node:assert/strict";

const base = process.argv[2] ?? "http://localhost:3101";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "Seed a local server only.");
const DAYS = 730;

// A small seeded generator, so each run writes the same journal.
let seed = 20261012;
function random() {
  seed = (seed + 0x6d2b79f5) | 0;
  let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

async function api({ path, method = "GET", body }) {
  const response = await fetch(`${base}${path}`, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json();
  assert.ok(response.ok || response.status === 404, `${method} ${path}: ${response.status} ${JSON.stringify(result)}`);
  return result;
}

function logicalDate(daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const NEW_GROUPS = {
  Food: ["Home cooking", "Eat out", "Fast food", "Vegetables", "Sweets", "Coffee", "Tea", "Water"],
  Emotions: ["Calm", "Anxious", "Grateful", "Tired", "Focused", "Bored", "Proud", "Lonely"],
  Weather: ["Sunny", "Cloudy", "Rain", "Storm", "Hot", "Cold"],
};
const MORE_ACTIVITIES = {
  "group-health": ["Run", "Yoga", "Swim", "Cycle", "Stretch", "Meditate", "Nap"],
  "group-work": ["Email", "Planning", "Code review", "Writing", "Commute"],
  "group-home": ["Laundry", "Shopping", "Garden", "Repairs"],
  "group-people": ["Partner", "Date", "Party", "Phone call"],
  "group-leisure": ["Movie", "TV", "Podcast", "Travel", "Photography", "Drawing"],
};

let bootstrap = await api({ path: "/api/bootstrap" });
if (bootstrap.activities.length < 40) {
  for (const [name, activities] of Object.entries(NEW_GROUPS)) {
    const { group } = await api({ path: "/api/catalog", method: "POST", body: { kind: "group", name } });
    for (const activity of activities) await api({ path: "/api/catalog", method: "POST", body: { kind: "activity", name: activity, groupId: group.id, icon: "category" } });
  }
  for (const [groupId, activities] of Object.entries(MORE_ACTIVITIES)) {
    for (const activity of activities) await api({ path: "/api/catalog", method: "POST", body: { kind: "activity", name: activity, groupId, icon: "category" } });
  }
  bootstrap = await api({ path: "/api/bootstrap" });
  const byName = (name) => bootstrap.activities.find((activity) => activity.name === name).id;
  for (const goal of [
    { name: "Meditate daily", activityId: byName("Meditate"), repeatType: "daily", scheduleType: "daily", startDate: logicalDate(DAYS) },
    { name: "Run three times", activityId: byName("Run"), repeatType: "weekly", scheduleType: "times_per_week", targetPerWeek: 3, startDate: logicalDate(DAYS) },
    { name: "Eat vegetables", activityId: byName("Vegetables"), repeatType: "daily", scheduleType: "daily", startDate: logicalDate(DAYS) },
    { name: "No screens after ten", repeatType: "daily", scheduleType: "weekdays", weekdaysMask: 0b0111110, startDate: logicalDate(DAYS) },
  ]) await api({ path: "/api/catalog", method: "POST", body: { kind: "goal", ...goal } });
  bootstrap = await api({ path: "/api/bootstrap" });
}

// Each activity has its own frequency and its own link to the mood, so the insights have patterns to find.
const profiles = bootstrap.activities.map((activity, index) => ({ id: activity.id, frequency: 0.05 + random() * 0.45, moodPull: (index % 5) - 2 }));
const linkedGoals = bootstrap.goals.filter((goal) => goal.activityId);
const freeGoals = bootstrap.goals.filter((goal) => !goal.activityId);
let written = 0;
for (let daysAgo = DAYS; daysAgo >= 1; daysAgo -= 1) {
  // About one day in twelve has no entry.
  if (random() < 0.08) continue;
  const date = logicalDate(daysAgo);
  const baseline = 3 + Math.sin(daysAgo / 58) * 0.8 + (new Date(`${date}T12:00:00`).getDay() % 6 === 0 ? 0.5 : 0);
  const activityIds = [];
  let pull = 0;
  for (const profile of profiles) {
    if (random() < profile.frequency * 0.35) {
      activityIds.push(profile.id);
      pull += profile.moodPull * 0.25;
    }
  }
  const score = Math.min(5, Math.max(1, Math.round(baseline + pull + (random() - 0.5) * 1.6)));
  const moodId = bootstrap.moods.find((mood) => mood.score === score).id;
  // A goal linked to an activity is completed on the days that have the activity.
  for (const goal of linkedGoals) {
    if (activityIds.includes(goal.activityId)) await api({ path: `/api/goal-completions/${date}/${goal.id}`, method: "PUT", body: { completed: true } });
  }
  for (const goal of freeGoals) {
    if (random() < 0.6) await api({ path: `/api/goal-completions/${date}/${goal.id}`, method: "PUT", body: { completed: true } });
  }
  await api({ path: `/api/entries/${date}`, method: "PUT", body: { moodId, activityIds, completedGoalIds: [], localTime: "21:30", timezone: "UTC" } });
  written += 1;
}
const insights = await api({ path: "/api/insights" });
console.log(`${base}: ${bootstrap.groups.length} groups, ${bootstrap.activities.length} activities, ${bootstrap.goals.length} goals, ${written} entries written, ${insights.days.length} recorded days.`);
