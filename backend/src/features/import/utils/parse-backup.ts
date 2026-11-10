import { ALL_WEEKDAYS_MASK } from "@app/common/features/goals/utils/goal-history";
import { isLogicalDate } from "@app/common/features/core/utils/logical-date";
import type { DaylioBackup } from "../types.js";
import { AppError } from "../../core/errors/app-error.js";

type Item = Record<string, unknown>;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const COMPLETION_TIME = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
/** The names of the Material Symbols font are lower-case words joined by underscores. */
const ICON_NAME = /^[a-z0-9_]+$/;

const COLLECTIONS = [
  "moods",
  "groups",
  "activities",
  "goals",
  "entries",
  "completions",
] as const;
type Collection = (typeof COLLECTIONS)[number];

function refuse(message: string): never {
  throw new AppError({ code: "INVALID_REQUEST", message });
}

function requiredString(value: unknown, field: string): void {
  if (typeof value !== "string" || !value.trim()) {
    refuse(`Import ${field} must be a non-empty string.`);
  }
}

function optionalString(value: unknown, field: string): void {
  if (value != null && typeof value !== "string") {
    refuse(`Import ${field} must be a string.`);
  }
}

function integer(value: unknown, field: string): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    refuse(`Import ${field} must be an integer.`);
  }
}

function reference(value: unknown, ids: Set<string>, field: string): void {
  if (typeof value !== "string" || !ids.has(value)) {
    refuse(`Import ${field} references an unknown record.`);
  }
}

function date(value: unknown): void {
  if (!isLogicalDate(value)) {
    refuse("Import contains an invalid date.");
  }
}

/** The repeat rule of a goal, as the journal stores it. */
function normalizeGoal(goal: Item): void {
  const { repeatType, scheduleType, targetPerWeek, weekdaysMask } = goal;
  if (
    scheduleType !== undefined &&
    !["daily", "weekdays", "times_per_week"].includes(scheduleType as string)
  ) {
    refuse("Choose Daily or Weekly for goal repeat.");
  }
  if (
    repeatType !== undefined &&
    repeatType !== "daily" &&
    repeatType !== "weekly"
  ) {
    refuse("Choose Daily or Weekly for goal repeat.");
  }
  if (targetPerWeek != null && typeof targetPerWeek !== "number") {
    refuse("Weekly goal target must be a number.");
  }
  if (weekdaysMask != null && typeof weekdaysMask !== "number") {
    refuse("Daily goal weekdays must be a number.");
  }
  const repeat =
    repeatType ?? (scheduleType === "times_per_week" ? "weekly" : "daily");
  if (repeat === "weekly") {
    const target = (targetPerWeek as number | null | undefined) ?? 1;
    if (!Number.isInteger(target) || target < 1 || target > 7) {
      refuse("Weekly goals must target between 1 and 7 days.");
    }
    Object.assign(goal, {
      repeatType: "weekly",
      scheduleType: "times_per_week",
      targetPerWeek: target,
      weekdaysMask: null,
    });
    return;
  }
  const mask = (weekdaysMask as number | null | undefined) ?? ALL_WEEKDAYS_MASK;
  if (!Number.isInteger(mask) || mask < 1 || mask > ALL_WEEKDAYS_MASK) {
    refuse("Daily goals must include at least one weekday.");
  }
  Object.assign(goal, {
    repeatType: "daily",
    scheduleType: mask === ALL_WEEKDAYS_MASK ? "daily" : "weekdays",
    targetPerWeek: null,
    weekdaysMask: mask,
  });
}

/**
 * Check the whole backup before anything is written, so that a refusal
 * changes nothing. The goals of the result carry a normalized repeat rule and
 * a valid icon.
 */
export function parseBackup(input: unknown): DaylioBackup {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    refuse("Import must be an object.");
  }
  const payload = input as Item;
  if (payload["sourceSystem"] !== "daylio") {
    refuse("Only Daylio normalized imports are supported.");
  }
  optionalString(payload["sourceSha256"], "source hash");
  optionalString(payload["csvSha256"], "CSV hash");
  const collections = {} as Record<Collection, Item[]>;
  const ids = {} as Record<Collection, Set<string>>;
  for (const key of COLLECTIONS) {
    const items = payload[key];
    if (!Array.isArray(items)) {
      refuse(`Import ${key} must be an array.`);
    }
    const known = new Set<string>();
    for (const item of items as unknown[]) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        refuse(`Import ${key} contains an invalid record.`);
      }
      const { sourceId } = item as Item;
      requiredString(sourceId, "source ID");
      if (known.has(sourceId as string)) {
        refuse(`Import ${key} contains duplicate source IDs.`);
      }
      known.add(sourceId as string);
    }
    collections[key] = items as Item[];
    ids[key] = known;
  }
  for (const key of ["moods", "groups", "activities", "goals"] as const) {
    for (const item of collections[key]) {
      requiredString(item["name"], "name");
      if (key !== "moods") {
        integer(item["sortOrder"], "sort order");
      }
      if (
        item["archived"] !== undefined &&
        typeof item["archived"] !== "boolean"
      ) {
        refuse("Import archived must be a boolean.");
      }
      if (item["sourceState"] != null) {
        integer(item["sourceState"], "source state");
      }
    }
  }
  for (const mood of collections.moods) {
    integer(mood["score"], "mood score");
    if (Number(mood["score"]) < 1 || Number(mood["score"]) > 5) {
      refuse("Import mood score must be between 1 and 5.");
    }
    optionalString(mood["emoji"], "mood emoji");
  }
  for (const activity of collections.activities) {
    reference(activity["groupSourceId"], ids.groups, "activity group");
    optionalString(activity["sourceIconId"], "activity icon");
  }
  for (const goal of collections.goals) {
    if (goal["activitySourceId"] != null) {
      reference(goal["activitySourceId"], ids.activities, "goal activity");
    }
    normalizeGoal(goal);
    optionalString(goal["materialIcon"], "goal icon");
    goal["materialIcon"] =
      typeof goal["materialIcon"] === "string" &&
      ICON_NAME.test(goal["materialIcon"])
        ? goal["materialIcon"]
        : "task_alt";
    if (
      goal["reminderEnabled"] !== undefined &&
      typeof goal["reminderEnabled"] !== "boolean"
    ) {
      refuse("Import reminderEnabled must be a boolean.");
    }
    const reminderTime = goal["reminderTime"];
    if (
      reminderTime != null &&
      (typeof reminderTime !== "string" || !TIME.test(reminderTime))
    ) {
      refuse("Import contains an invalid reminder time.");
    }
  }
  const dates = new Set<string>();
  for (const entry of collections.entries) {
    date(entry["logicalDate"]);
    const logicalDate = entry["logicalDate"] as string;
    if (dates.has(logicalDate)) {
      refuse("Import contains more than one entry for a date.");
    }
    dates.add(logicalDate);
    if (
      typeof entry["localTime"] !== "string" ||
      !TIME.test(entry["localTime"])
    ) {
      refuse("Import contains an invalid entry time.");
    }
    reference(entry["moodSourceId"], ids.moods, "entry mood");
    if (!Array.isArray(entry["activitySourceIds"])) {
      refuse("Import entry activities must be an array.");
    }
    for (const id of entry["activitySourceIds"] as unknown[]) {
      reference(id, ids.activities, "entry activity");
    }
    if (entry["timezoneOffsetMinutes"] != null) {
      integer(entry["timezoneOffsetMinutes"], "timezone offset");
    }
    optionalString(entry["legacyNote"], "note");
    optionalString(entry["legacyNoteTitle"], "note title");
  }
  for (const completion of collections.completions) {
    date(completion["logicalDate"]);
    reference(completion["goalSourceId"], ids.goals, "completion goal");
    const localTime = completion["localTime"];
    if (
      localTime != null &&
      (typeof localTime !== "string" || !COMPLETION_TIME.test(localTime))
    ) {
      refuse("Import contains an invalid completion time.");
    }
  }
  return payload as unknown as DaylioBackup;
}
