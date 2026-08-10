export type EntryInputCandidate = {
  moodId: string;
  activityIds: string[];
  completedGoalIds: string[];
  localTime?: string;
  timezone?: string;
  timezoneOffsetMinutes?: number;
  expectedVersion?: number;
  legacyNoteTitle?: string;
  legacyNote?: string;
};

type ReferenceIndex = {
  has: (id: string) => boolean;
};

export type EntryReferenceIndexes = {
  moodIds: ReferenceIndex;
  activityIds: ReferenceIndex;
  goalIds: ReferenceIndex;
};

export function isValidTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function requireStringArray(value: unknown, label: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error(`${label} must be an array of strings.`);
  return value as string[];
}

export function validateEntryInput(input: unknown): EntryInputCandidate {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Entry payload must be an object.");
  const candidate = input as Record<string, unknown>;
  const moodId = candidate.moodId;
  const localTime = candidate.localTime;
  const timezone = candidate.timezone;
  const timezoneOffsetMinutes = candidate.timezoneOffsetMinutes;
  const expectedVersion = candidate.expectedVersion;
  const legacyNoteTitle = candidate.legacyNoteTitle;
  const legacyNote = candidate.legacyNote;
  if (typeof moodId !== "string") throw new Error("Choose one of the five moods.");
  const activityIds = requireStringArray(candidate.activityIds, "Activity IDs");
  const completedGoalIds = requireStringArray(candidate.completedGoalIds, "Goal IDs");
  if (localTime !== undefined && (typeof localTime !== "string" || !isValidTime(localTime))) throw new Error("Choose a valid entry time.");
  if (timezone !== undefined && typeof timezone !== "string") throw new Error("Timezone must be a string.");
  if (timezoneOffsetMinutes !== undefined && (typeof timezoneOffsetMinutes !== "number" || !Number.isInteger(timezoneOffsetMinutes) || !Number.isFinite(timezoneOffsetMinutes))) throw new Error("Timezone offset must be an integer.");
  if (expectedVersion !== undefined && (typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion) || expectedVersion < 1)) throw new Error("Expected version must be a positive integer.");
  if (legacyNoteTitle !== undefined && typeof legacyNoteTitle !== "string") throw new Error("Legacy note title must be a string.");
  if (legacyNote !== undefined && typeof legacyNote !== "string") throw new Error("Legacy note must be a string.");
  return {
    moodId,
    activityIds,
    completedGoalIds,
    ...(localTime === undefined ? {} : { localTime }),
    ...(timezone === undefined ? {} : { timezone }),
    ...(timezoneOffsetMinutes === undefined ? {} : { timezoneOffsetMinutes }),
    ...(expectedVersion === undefined ? {} : { expectedVersion }),
    ...(legacyNoteTitle === undefined ? {} : { legacyNoteTitle }),
    ...(legacyNote === undefined ? {} : { legacyNote }),
  };
}

export function validateEntryReferences(input: EntryInputCandidate, references: EntryReferenceIndexes) {
  if (!references.moodIds.has(input.moodId)) throw new Error("Choose one of the five moods.");
  if (input.activityIds.some((id) => !references.activityIds.has(id))) throw new Error("One activity is no longer available.");
  if (input.completedGoalIds.some((id) => !references.goalIds.has(id))) throw new Error("One goal is no longer available.");
  return input;
}
