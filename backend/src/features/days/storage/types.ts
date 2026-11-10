import type { Generated, Selectable } from "kysely";

/**
 * These tables come from the old app (`backend/migrations/0000` and later),
 * and they keep its columns. A time is the text that `toISOString()` writes.
 */

interface EntryTable {
  id: string;
  /** `YYYY-MM-DD`. Each day has one row, also after a delete. */
  logicalDate: string;
  localTime: string | null;
  timezone: string | null;
  timezoneOffsetMinutes: number | null;
  moodId: string;
  legacyNoteTitle: string | null;
  legacyNote: string | null;
  /** Counts each save and each delete. A save with another version is a conflict. */
  version: Generated<number>;
  sourceSystem: string | null;
  sourceId: string | null;
  sourceCreatedAt: string | null;
  /** A deleted entry keeps its row. */
  deletedAt: string | null;
  createdAt: Generated<string>;
  updatedAt: Generated<string>;
}

interface EntryActivityTable {
  entryId: string;
  activityId: string;
}

/** The mood that the owner tapped for a day. A save of the day consumes it. */
interface DayMoodSelectionTable {
  logicalDate: string;
  moodId: string;
  createdAt: Generated<string>;
  updatedAt: Generated<string>;
}

/** An activity that the owner tapped on or off for a day. A save consumes it. */
interface DayActivitySelectionTable {
  logicalDate: string;
  activityId: string;
  /** 0 or 1. */
  selected: number;
  createdAt: Generated<string>;
  updatedAt: Generated<string>;
}

interface GoalCompletionTable {
  id: string;
  goalId: string;
  logicalDate: string;
  localTime: string | null;
  entryId: string | null;
  sourceSystem: string | null;
  sourceId: string | null;
  createdAt: Generated<string>;
  updatedAt: Generated<string>;
}

export interface DaysTables {
  entries: EntryTable;
  entryActivities: EntryActivityTable;
  dayMoodSelections: DayMoodSelectionTable;
  dayActivitySelections: DayActivitySelectionTable;
  goalCompletions: GoalCompletionTable;
}

export type EntryRow = Selectable<EntryTable>;

/** A row of the entry list. */
export interface EntryListRow extends EntryRow {
  /** The mood the owner tapped, when there is one, or else the saved mood. */
  effectiveMoodId: string;
}

/** A saved day of the analysis: its mood is the one the owner sees. */
export interface EffectiveDayRow {
  id: string;
  logicalDate: string;
  effectiveMoodId: string;
}

export interface ActivityLink {
  entryId: string;
  activityId: string;
}

export interface ActivitySelectionRow {
  logicalDate: string;
  activityId: string;
  selected: number;
}

export interface CompletionRow {
  logicalDate: string;
  goalId: string;
}

/** What the day with `logicalDate` has stored, before the pending taps are applied. */
export interface DayRows {
  entry: EntryRow | undefined;
  pendingMoodId: string | undefined;
  selections: ActivitySelectionRow[];
  links: string[];
  completedGoalIds: string[];
}

/** The entry columns that a save writes. */
export interface EntryWrite {
  id: string;
  logicalDate: string;
  localTime: string;
  timezone: string;
  timezoneOffsetMinutes: number | null;
  moodId: string;
  legacyNoteTitle: string | null;
  legacyNote: string | null;
  createdAt: string;
  updatedAt: string;
  /** The version and the deleted time of the row that this save replaces. */
  replaces: { version: number; deletedAt: string | null };
}
