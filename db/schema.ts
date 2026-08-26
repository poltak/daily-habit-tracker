import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const moodLevels = sqliteTable("mood_levels", {
  id: text("id").primaryKey(),
  score: integer("score").notNull(),
  name: text("name").notNull(),
  emoji: text("emoji").notNull(),
  color: text("color").notNull(),
  sortOrder: integer("sort_order").notNull(),
  sourceSystem: text("source_system"),
  sourceId: text("source_id"),
}, (table) => ({ scoreIdx: uniqueIndex("mood_levels_score_idx").on(table.score) }));

export const activityGroups = sqliteTable("activity_groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull(),
  archivedAt: text("archived_at"),
  sourceSystem: text("source_system"),
  sourceId: text("source_id"),
  ...timestamps,
});

export const activities = sqliteTable("activities", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull().references(() => activityGroups.id),
  name: text("name").notNull(),
  materialIcon: text("material_icon").notNull().default("✨"),
  sourceIconId: text("source_icon_id"),
  sourceState: integer("source_state"),
  sortOrder: integer("sort_order").notNull(),
  archivedAt: text("archived_at"),
  sourceSystem: text("source_system"),
  sourceId: text("source_id"),
  ...timestamps,
});

export const entries = sqliteTable("entries", {
  id: text("id").primaryKey(),
  logicalDate: text("logical_date").notNull(),
  localTime: text("local_time"),
  timezone: text("timezone"),
  timezoneOffsetMinutes: integer("timezone_offset_minutes"),
  moodId: text("mood_id").notNull().references(() => moodLevels.id),
  legacyNoteTitle: text("legacy_note_title"),
  legacyNote: text("legacy_note"),
  version: integer("version").notNull().default(1),
  sourceSystem: text("source_system"),
  sourceId: text("source_id"),
  sourceCreatedAt: text("source_created_at"),
  deletedAt: text("deleted_at"),
  ...timestamps,
}, (table) => ({ logicalDateIdx: uniqueIndex("entries_logical_date_idx").on(table.logicalDate) }));

export const entryActivities = sqliteTable("entry_activities", {
  entryId: text("entry_id").notNull().references(() => entries.id),
  activityId: text("activity_id").notNull().references(() => activities.id),
}, (table) => ({ pairIdx: uniqueIndex("entry_activities_pair_idx").on(table.entryId, table.activityId) }));

export const goals = sqliteTable("goals", {
  id: text("id").primaryKey(),
  activityId: text("activity_id").notNull().references(() => activities.id),
  name: text("name").notNull(),
  scheduleType: text("schedule_type").notNull(),
  targetPerWeek: integer("target_per_week"),
  weekdaysMask: integer("weekdays_mask"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  reminderEnabled: integer("reminder_enabled", { mode: "boolean" }).notNull().default(false),
  reminderTime: text("reminder_time"),
  sortOrder: integer("sort_order").notNull(),
  archivedAt: text("archived_at"),
  sourceSystem: text("source_system"),
  sourceId: text("source_id"),
  sourceRepeatType: integer("source_repeat_type"),
  sourceRepeatValue: integer("source_repeat_value"),
  sourceState: integer("source_state"),
  ...timestamps,
});

export const goalCompletions = sqliteTable("goal_completions", {
  id: text("id").primaryKey(),
  goalId: text("goal_id").notNull().references(() => goals.id),
  logicalDate: text("logical_date").notNull(),
  localTime: text("local_time"),
  entryId: text("entry_id").references(() => entries.id),
  sourceSystem: text("source_system"),
  sourceId: text("source_id"),
  ...timestamps,
}, (table) => ({ goalDateIdx: uniqueIndex("goal_completions_goal_date_idx").on(table.goalId, table.logicalDate) }));

export const dayMoodSelections = sqliteTable("day_mood_selections", {
  logicalDate: text("logical_date").primaryKey(),
  moodId: text("mood_id").notNull().references(() => moodLevels.id),
  ...timestamps,
});

export const dayActivitySelections = sqliteTable("day_activity_selections", {
  logicalDate: text("logical_date").notNull(),
  activityId: text("activity_id").notNull().references(() => activities.id),
  selected: integer("selected", { mode: "boolean" }).notNull(),
  ...timestamps,
}, (table) => ({ dateActivityIdx: uniqueIndex("day_activity_selections_date_activity_idx").on(table.logicalDate, table.activityId) }));

export const importRuns = sqliteTable("import_runs", {
  id: text("id").primaryKey(),
  sourceSystem: text("source_system").notNull(),
  sourceSha256: text("source_sha256").notNull(),
  sourceVersion: text("source_version"),
  status: text("status").notNull(),
  reportJson: text("report_json").notNull(),
  startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
}, (table) => ({ sourceIdx: uniqueIndex("import_runs_source_sha256_idx").on(table.sourceSha256) }));
