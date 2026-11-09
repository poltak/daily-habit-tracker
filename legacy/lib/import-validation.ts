import { isLogicalDate, normalizeGoalConfig, type ImportPayload } from "./daylio.ts";
import { isValidTime } from "./entry-validation.ts";

type Item = Record<string, unknown>;

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Import ${field} must be a non-empty string.`);
  return value;
}

function optionalString(value: unknown, field: string) {
  if (value != null && typeof value !== "string") throw new Error(`Import ${field} must be a string.`);
}

function integer(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`Import ${field} must be an integer.`);
}

function reference(value: unknown, ids: Set<string>, field: string) {
  if (typeof value !== "string" || !ids.has(value)) throw new Error(`Import ${field} references an unknown record.`);
}

function date(value: unknown) {
  if (typeof value !== "string" || !isLogicalDate(value)) throw new Error("Import contains an invalid date.");
}

export function validateImportPayload(input: unknown): asserts input is ImportPayload {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Import must be an object.");
  const payload = input as Item;
  if (payload.sourceSystem !== "daylio") throw new Error("Only Daylio normalized imports are supported.");
  optionalString(payload.sourceSha256, "source hash");
  optionalString(payload.csvSha256, "CSV hash");
  const collections = {} as Record<"moods" | "groups" | "activities" | "goals" | "entries" | "completions", Item[]>;
  const ids = {} as Record<keyof typeof collections, Set<string>>;
  for (const key of ["moods", "groups", "activities", "goals", "entries", "completions"] as const) {
    const items = payload[key];
    if (!Array.isArray(items)) throw new Error(`Import ${key} must be an array.`);
    const known = new Set<string>();
    for (const item of items) {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`Import ${key} contains an invalid record.`);
      const id = requiredString(item.sourceId, "source ID");
      if (known.has(id)) throw new Error(`Import ${key} contains duplicate source IDs.`);
      known.add(id);
    }
    collections[key] = items;
    ids[key] = known;
  }
  for (const key of ["moods", "groups", "activities", "goals"] as const) {
    for (const item of collections[key]) {
      requiredString(item.name, "name");
      if (key !== "moods") integer(item.sortOrder, "sort order");
      if (item.archived !== undefined && typeof item.archived !== "boolean") throw new Error("Import archived must be a boolean.");
      if (item.sourceState != null) integer(item.sourceState, "source state");
    }
  }
  for (const mood of collections.moods) {
    integer(mood.score, "mood score");
    if (Number(mood.score) < 1 || Number(mood.score) > 5) throw new Error("Import mood score must be between 1 and 5.");
    optionalString(mood.emoji, "mood emoji");
  }
  for (const activity of collections.activities) {
    reference(activity.groupSourceId, ids.groups, "activity group");
    optionalString(activity.sourceIconId, "activity icon");
  }
  for (const goal of collections.goals) {
    if (goal.activitySourceId != null) reference(goal.activitySourceId, ids.activities, "goal activity");
    normalizeGoalConfig(goal);
    optionalString(goal.materialIcon, "goal icon");
    if (goal.reminderEnabled !== undefined && typeof goal.reminderEnabled !== "boolean") throw new Error("Import reminderEnabled must be a boolean.");
    if (goal.reminderTime != null && (typeof goal.reminderTime !== "string" || !isValidTime(goal.reminderTime))) throw new Error("Import contains an invalid reminder time.");
  }
  const dates = new Set<string>();
  for (const entry of collections.entries) {
    date(entry.logicalDate);
    const logicalDate = entry.logicalDate as string;
    if (dates.has(logicalDate)) throw new Error("Import contains more than one entry for a date.");
    dates.add(logicalDate);
    if (typeof entry.localTime !== "string" || !isValidTime(entry.localTime)) throw new Error("Import contains an invalid entry time.");
    reference(entry.moodSourceId, ids.moods, "entry mood");
    if (!Array.isArray(entry.activitySourceIds)) throw new Error("Import entry activities must be an array.");
    for (const id of entry.activitySourceIds) reference(id, ids.activities, "entry activity");
    if (entry.timezoneOffsetMinutes != null) integer(entry.timezoneOffsetMinutes, "timezone offset");
    optionalString(entry.legacyNote, "note");
    optionalString(entry.legacyNoteTitle, "note title");
  }
  for (const completion of collections.completions) {
    date(completion.logicalDate);
    reference(completion.goalSourceId, ids.goals, "completion goal");
    if (completion.localTime != null && (typeof completion.localTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(completion.localTime))) throw new Error("Import contains an invalid completion time.");
  }
}
