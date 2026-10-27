import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
  activityId: text("activity_id").references(() => activities.id),
  name: text("name").notNull(),
  materialIcon: text("material_icon").notNull().default("task_alt"),
  repeatType: text("repeat_type").notNull().default("daily"),
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
}, (table) => ({
  goalDateIdx: uniqueIndex("goal_completions_goal_date_idx").on(table.goalId, table.logicalDate),
  dateGoalIdx: index("goal_completions_date_goal_idx").on(table.logicalDate, table.goalId),
}));

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

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

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

// Passkey sign-in and the OAuth server of the MCP endpoint. The SQL is in
// worker/auth/store.ts and worker/auth/oauth.ts. Times are Unix milliseconds.

export const passkeys = sqliteTable("passkeys", {
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  counter: integer("counter").notNull().default(0),
  transportsJson: text("transports_json").notNull().default("[]"),
  deviceType: text("device_type").notNull(),
  backedUp: integer("backed_up", { mode: "boolean" }).notNull().default(false),
  name: text("name").notNull(),
  createdAt: integer("created_at").notNull(),
  lastUsedAt: integer("last_used_at"),
});

export const authSessions = sqliteTable("auth_sessions", {
  id: text("id").primaryKey(),
  passkeyId: text("passkey_id"),
  createdAt: integer("created_at").notNull(),
  lastSeenAt: integer("last_seen_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, (table) => ({
  passkeyIdx: index("auth_sessions_passkey_idx").on(table.passkeyId),
  expiresIdx: index("auth_sessions_expires_idx").on(table.expiresAt),
}));

export const authChallenges = sqliteTable("auth_challenges", {
  id: text("id").primaryKey(),
  purpose: text("purpose").notNull(),
  challenge: text("challenge").notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, (table) => ({ expiresIdx: index("auth_challenges_expires_idx").on(table.expiresAt) }));

export const authAttempts = sqliteTable("auth_attempts", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => ({ kindCreatedIdx: index("auth_attempts_kind_created_idx").on(table.kind, table.createdAt) }));

export const oauthClients = sqliteTable("oauth_clients", {
  id: text("id").primaryKey(),
  secretHash: text("secret_hash"),
  name: text("name").notNull(),
  redirectUrisJson: text("redirect_uris_json").notNull(),
  tokenEndpointAuthMethod: text("token_endpoint_auth_method").notNull(),
  createdAt: integer("created_at").notNull(),
  approvedAt: integer("approved_at"),
});

export const oauthGrants = sqliteTable("oauth_grants", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  scope: text("scope").notNull().default(""),
  resource: text("resource").notNull(),
  createdAt: integer("created_at").notNull(),
  lastUsedAt: integer("last_used_at"),
}, (table) => ({ clientIdx: index("oauth_grants_client_idx").on(table.clientId) }));

export const oauthCodes = sqliteTable("oauth_codes", {
  id: text("id").primaryKey(),
  grantId: text("grant_id").notNull(),
  clientId: text("client_id").notNull(),
  redirectUri: text("redirect_uri").notNull(),
  codeChallenge: text("code_challenge").notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, (table) => ({ expiresIdx: index("oauth_codes_expires_idx").on(table.expiresAt) }));

export const oauthTokens = sqliteTable("oauth_tokens", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  grantId: text("grant_id").notNull(),
  clientId: text("client_id").notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, (table) => ({
  grantIdx: index("oauth_tokens_grant_idx").on(table.grantId),
  expiresIdx: index("oauth_tokens_expires_idx").on(table.expiresAt),
}));
