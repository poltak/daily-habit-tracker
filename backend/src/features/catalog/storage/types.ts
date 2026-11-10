import type { Generated, Selectable } from "kysely";

/**
 * These tables come from the old app (`backend/migrations/0000` and later),
 * and they keep its columns. A time is the text that `CURRENT_TIMESTAMP` or
 * `toISOString()` writes.
 */

interface MoodLevelTable {
  id: string;
  /** 1 (awful) to 5 (rad). The score is unique. */
  score: number;
  name: string;
  emoji: string;
  color: string;
  sortOrder: number;
  sourceSystem: string | null;
  sourceId: string | null;
}

interface ActivityGroupTable {
  id: string;
  name: string;
  sortOrder: number;
  archivedAt: string | null;
  sourceSystem: string | null;
  sourceId: string | null;
  createdAt: Generated<string>;
  updatedAt: Generated<string>;
}

interface ActivityTable {
  id: string;
  groupId: string;
  name: string;
  materialIcon: Generated<string>;
  sourceIconId: string | null;
  sortOrder: number;
  archivedAt: string | null;
  sourceSystem: string | null;
  sourceId: string | null;
  sourceState: number | null;
  createdAt: Generated<string>;
  updatedAt: Generated<string>;
}

interface GoalTable {
  id: string;
  activityId: string | null;
  name: string;
  materialIcon: Generated<string>;
  repeatType: Generated<string>;
  scheduleType: string;
  targetPerWeek: number | null;
  weekdaysMask: number | null;
  startDate: string | null;
  endDate: string | null;
  /** 0 or 1. */
  reminderEnabled: Generated<number>;
  reminderTime: string | null;
  sortOrder: number;
  archivedAt: string | null;
  sourceSystem: string | null;
  sourceId: string | null;
  sourceRepeatType: number | null;
  sourceRepeatValue: number | null;
  sourceState: number | null;
  createdAt: Generated<string>;
  updatedAt: Generated<string>;
}

export interface CatalogTables {
  moodLevels: MoodLevelTable;
  activityGroups: ActivityGroupTable;
  activities: ActivityTable;
  goals: GoalTable;
}

export type MoodRow = Selectable<MoodLevelTable>;
export type ActivityGroupRow = Selectable<ActivityGroupTable>;
export type ActivityRow = Selectable<ActivityTable>;
export type GoalRow = Selectable<GoalTable>;

/** One `insert or ignore` statement for a table, and the values of each row. */
export interface SeedInsert {
  /** The SQL with one `?` for each value. */
  sql: string;
  rows: readonly (readonly (string | number | null)[])[];
}
