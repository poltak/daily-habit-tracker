import {
  type Activity,
  type ActivityGroup,
  type Bootstrap,
  type Entry,
  type EntryInput,
  type Goal,
  type ImportPayload,
  type Mood,
  DaylioMemoryStore,
  MOODS,
  addDays,
  isLogicalDate,
  store as memoryStore,
} from "./daylio";
import { iconForActivity } from "./icons";

type Database = D1Database;

type EntryRow = {
  id: string;
  logical_date: string;
  local_time: string | null;
  timezone: string | null;
  timezone_offset_minutes: number | null;
  mood_id: string;
  legacy_note_title: string | null;
  legacy_note: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
type MoodRow = { id: string; name: string; score: number; emoji: string; color: string };
type GroupRow = { id: string; name: string; sort_order: number; archived_at: string | null };
type ActivityRow = { id: string; group_id: string; name: string; material_icon: string; source_icon_id: string | null; sort_order: number; archived_at: string | null };
type GoalRow = { id: string; activity_id: string; name: string; schedule_type: Goal["scheduleType"]; target_per_week: number | null; weekdays_mask: number | null; sort_order: number; archived_at: string | null; reminder_enabled: number; reminder_time: string | null; source_state: number | null };

async function currentDatabase(): Promise<Database | null> {
  try {
    const { env } = await import("cloudflare:workers");
    const candidate = env.DB as Database | undefined;
    return candidate && typeof candidate.prepare === "function" ? candidate : null;
  } catch {
    return null;
  }
}

async function databaseOrNull() {
  const database = await currentDatabase();
  if (!database) return null;
  try {
    await database.prepare("SELECT 1 FROM mood_levels LIMIT 1").first();
  } catch (error) {
    throw new Error(`D1 is configured but its schema is unavailable. Apply the migration before using the app. ${error instanceof Error ? error.message : ""}`.trim());
  }
  await seedDatabase(database);
  return database;
}

async function seedDatabase(database: Database) {
  const result = await database.prepare("SELECT COUNT(*) AS count FROM mood_levels").first<{ count: number }>();
  if (Number(result?.count ?? 0) > 0) return;
  const statements = MOODS.map((mood) => database.prepare("INSERT INTO mood_levels (id, score, name, emoji, color, sort_order) VALUES (?, ?, ?, ?, ?, ?)").bind(mood.id, mood.score, mood.name, mood.emoji, mood.color, mood.score * -1));
  const groups = [
    ["group-health", "Health", 0], ["group-work", "Work", 1], ["group-home", "Home", 2], ["group-people", "People", 3], ["group-leisure", "Leisure", 4],
  ];
  statements.push(...groups.map(([id, name, order]) => database.prepare("INSERT INTO activity_groups (id, name, sort_order) VALUES (?, ?, ?)").bind(id, name, order)));
  const activities = [
    ["activity-gym", "group-health", "Gym", "🏋️", 0], ["activity-walk", "group-health", "Walk", "🚶", 1], ["activity-sleep", "group-health", "Sleep", "🌙", 2],
    ["activity-deep-work", "group-work", "Deep work", "💻", 3], ["activity-meetings", "group-work", "Meetings", "👥", 4], ["activity-cook", "group-home", "Cook", "🍳", 5], ["activity-chores", "group-home", "Chores", "🧹", 6],
    ["activity-family", "group-people", "Family", "💛", 7], ["activity-friends", "group-people", "Friends", "🎉", 8], ["activity-reading", "group-leisure", "Reading", "📚", 9], ["activity-gaming", "group-leisure", "Gaming", "🎮", 10], ["activity-music", "group-leisure", "Music", "🎵", 11],
  ];
  statements.push(...activities.map(([id, groupId, name, icon, order]) => database.prepare("INSERT INTO activities (id, group_id, name, material_icon, sort_order) VALUES (?, ?, ?, ?, ?)").bind(id, groupId, name, icon, order)));
  statements.push(database.prepare("INSERT INTO goals (id, activity_id, name, schedule_type, target_per_week, sort_order, reminder_enabled) VALUES (?, ?, ?, ?, ?, ?, ?)").bind("goal-move", "activity-gym", "Move your body", "times_per_week", 3, 0, 0));
  statements.push(database.prepare("INSERT INTO goals (id, activity_id, name, schedule_type, sort_order, reminder_enabled) VALUES (?, ?, ?, ?, ?, ?)").bind("goal-read", "activity-reading", "Read", "daily", 1, 0));
  await database.batch(statements);
}

async function rows<T>(database: Database, statement: D1PreparedStatement) {
  const result = await statement.all<T>();
  return result.results ?? [];
}

function toMood(row: { id: string; name: string; score: number; emoji: string; color: string }): Mood {
  return { id: row.id, name: row.name, score: row.score, emoji: row.emoji, color: row.color };
}

function toGroup(row: { id: string; name: string; sort_order: number; archived_at: string | null }): ActivityGroup {
  return { id: row.id, name: row.name, sortOrder: row.sort_order, archived: Boolean(row.archived_at) };
}

function toActivity(row: { id: string; group_id: string; name: string; material_icon: string; source_icon_id: string | null; sort_order: number; archived_at: string | null }): Activity {
  return { id: row.id, groupId: row.group_id, name: row.name, icon: iconForActivity(row.name, row.material_icon !== "✨" ? row.material_icon : row.source_icon_id ?? undefined), sourceIconId: row.source_icon_id ?? undefined, sortOrder: row.sort_order, archived: Boolean(row.archived_at) };
}

function toGoal(row: { id: string; activity_id: string; name: string; schedule_type: Goal["scheduleType"]; target_per_week: number | null; weekdays_mask: number | null; sort_order: number; archived_at: string | null; reminder_enabled: number; reminder_time: string | null; source_state: number | null }): Goal {
  return { id: row.id, activityId: row.activity_id, name: row.name, scheduleType: row.schedule_type, targetPerWeek: row.target_per_week ?? undefined, weekdaysMask: row.weekdays_mask ?? undefined, sortOrder: row.sort_order, archived: Boolean(row.archived_at), reminderEnabled: Boolean(row.reminder_enabled), reminderTime: row.reminder_time ?? undefined, sourceState: row.source_state ?? undefined };
}

function toEntry(row: EntryRow, activityIds: string[], completedGoalIds: string[]): Entry {
  return { id: row.id, logicalDate: row.logical_date, localTime: row.local_time ?? "23:00", timezone: row.timezone ?? "", timezoneOffsetMinutes: row.timezone_offset_minutes ?? undefined, moodId: row.mood_id, activityIds, completedGoalIds, legacyNoteTitle: row.legacy_note_title ?? undefined, legacyNote: row.legacy_note ?? undefined, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at, deletedAt: row.deleted_at ?? undefined };
}

export class D1DaylioStore {
  constructor(private readonly database: Database) {}

  async bootstrap(entryLimit = 30, entryOffset = 0): Promise<Bootstrap> {
    const [moodRows, groupRows, activityRows, goalRows, entryRows, linkRows, completionRows] = await Promise.all([
      rows<MoodRow>(this.database, this.database.prepare("SELECT id, name, score, emoji, color FROM mood_levels ORDER BY score DESC")),
      rows<GroupRow>(this.database, this.database.prepare("SELECT id, name, sort_order, archived_at FROM activity_groups ORDER BY sort_order")),
      rows<ActivityRow>(this.database, this.database.prepare("SELECT id, group_id, name, material_icon, source_icon_id, sort_order, archived_at FROM activities ORDER BY sort_order")),
      rows<GoalRow>(this.database, this.database.prepare("SELECT id, activity_id, name, schedule_type, target_per_week, weekdays_mask, sort_order, archived_at, reminder_enabled, reminder_time, source_state FROM goals ORDER BY sort_order")),
      rows<EntryRow>(this.database, this.database.prepare("SELECT * FROM entries WHERE deleted_at IS NULL ORDER BY logical_date DESC LIMIT ? OFFSET ?").bind(entryLimit, entryOffset)),
      rows<{ entry_id: string; activity_id: string }>(this.database, this.database.prepare("SELECT entry_id, activity_id FROM entry_activities")),
      rows<{ entry_id: string | null; goal_id: string; logical_date: string }>(this.database, this.database.prepare("SELECT entry_id, goal_id, logical_date FROM goal_completions")),
    ]);
    const activityLinks = new Map<string, string[]>();
    for (const link of linkRows) activityLinks.set(link.entry_id, [...(activityLinks.get(link.entry_id) ?? []), link.activity_id]);
    const goalLinks = new Map<string, string[]>();
    for (const link of completionRows) if (link.entry_id) goalLinks.set(link.entry_id, [...(goalLinks.get(link.entry_id) ?? []), link.goal_id]);
    const entries = entryRows.map((row) => toEntry(row, activityLinks.get(row.id) ?? [], goalLinks.get(row.id) ?? []));
    const today = new Date();
    const todayValue = `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, "0")}-${`${today.getDate()}`.padStart(2, "0")}`;
    return { moods: moodRows.map(toMood), groups: groupRows.map(toGroup), activities: activityRows.map(toActivity), goals: goalRows.map(toGoal), entries, today: todayValue, yesterday: addDays(todayValue, -1) };
  }

  async listEntries(limit = 30, offset = 0) {
    const snapshot = await this.bootstrap(Math.min(limit, 101), Math.max(offset, 0));
    return snapshot.entries;
  }

  async listEntryDates(startDate: string, endDate: string) {
    const results = await rows<{ logical_date: string }>(this.database, this.database.prepare("SELECT logical_date FROM entries WHERE deleted_at IS NULL AND logical_date BETWEEN ? AND ? ORDER BY logical_date").bind(startDate, endDate));
    return results.map((row) => row.logical_date);
  }

  async getEntry(logicalDate: string) {
    const result = await rows<EntryRow>(this.database, this.database.prepare("SELECT * FROM entries WHERE logical_date = ? AND deleted_at IS NULL LIMIT 1").bind(logicalDate));
    if (!result[0]) return null;
    const activities = await rows<{ activity_id: string }>(this.database, this.database.prepare("SELECT activity_id FROM entry_activities WHERE entry_id = ?").bind(result[0].id));
    const goals = await rows<{ goal_id: string }>(this.database, this.database.prepare("SELECT goal_id FROM goal_completions WHERE entry_id = ?").bind(result[0].id));
    return toEntry(result[0], activities.map((item) => item.activity_id), goals.map((item) => item.goal_id));
  }

  async saveEntry(logicalDate: string, input: EntryInput) {
    if (!isLogicalDate(logicalDate)) throw new Error("Choose a valid date.");
    const existing = await this.getEntry(logicalDate);
    if (existing && input.expectedVersion !== undefined && existing.version !== input.expectedVersion) {
      const error = new Error("This entry changed on another device."); (error as Error & { code?: string }).code = "VERSION_CONFLICT"; throw error;
    }
    const id = existing?.id ?? `entry-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    const version = (existing?.version ?? 0) + 1;
    const statements = [this.database.prepare(`INSERT INTO entries (id, logical_date, local_time, timezone, timezone_offset_minutes, mood_id, legacy_note_title, legacy_note, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(logical_date) DO UPDATE SET local_time=excluded.local_time, timezone=excluded.timezone, timezone_offset_minutes=excluded.timezone_offset_minutes, mood_id=excluded.mood_id, legacy_note_title=excluded.legacy_note_title, legacy_note=excluded.legacy_note, version=excluded.version, updated_at=excluded.updated_at, deleted_at=NULL`).bind(id, logicalDate, input.localTime ?? existing?.localTime ?? "23:00", input.timezone ?? existing?.timezone ?? "", input.timezoneOffsetMinutes ?? existing?.timezoneOffsetMinutes ?? null, input.moodId, input.legacyNoteTitle ?? existing?.legacyNoteTitle ?? null, input.legacyNote ?? existing?.legacyNote ?? null, version, existing?.createdAt ?? timestamp, timestamp), this.database.prepare("DELETE FROM entry_activities WHERE entry_id = ?").bind(id), this.database.prepare("DELETE FROM goal_completions WHERE logical_date = ?").bind(logicalDate)];
    statements.push(...[...new Set(input.activityIds)].map((activityId) => this.database.prepare("INSERT INTO entry_activities (entry_id, activity_id) VALUES (?, ?)").bind(id, activityId)));
    statements.push(...[...new Set(input.completedGoalIds)].map((goalId) => this.database.prepare("INSERT INTO goal_completions (id, goal_id, logical_date, entry_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(`completion-${goalId}-${logicalDate}`, goalId, logicalDate, id, timestamp, timestamp)));
    await this.database.batch(statements);
    return this.getEntry(logicalDate);
  }

  async deleteEntry(logicalDate: string, expectedVersion?: number) {
    const existing = await this.getEntry(logicalDate);
    if (!existing) return null;
    if (expectedVersion !== undefined && existing.version !== expectedVersion) { const error = new Error("This entry changed on another device."); (error as Error & { code?: string }).code = "VERSION_CONFLICT"; throw error; }
    await this.database.prepare("UPDATE entries SET deleted_at = ?, updated_at = ?, version = ? WHERE logical_date = ?").bind(new Date().toISOString(), new Date().toISOString(), existing.version + 1, logicalDate).run();
    return this.getEntry(logicalDate);
  }

  async createGroup(name: string) {
    const clean = name.trim(); if (!clean) throw new Error("Group name is required.");
    const result = await this.database.prepare("INSERT INTO activity_groups (id, name, sort_order) VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM activity_groups)) RETURNING id, name, sort_order, archived_at").bind(`group-${crypto.randomUUID()}`, clean).first<{ id: string; name: string; sort_order: number; archived_at: string | null }>();
    if (!result) throw new Error("Could not create the group.");
    return toGroup(result);
  }

  async updateGroup(id: string, patch: Partial<Pick<ActivityGroup, "name" | "sortOrder" | "archived">>) {
    const current = await this.database.prepare("SELECT id, name, sort_order, archived_at FROM activity_groups WHERE id = ?").bind(id).first<{ id: string; name: string; sort_order: number; archived_at: string | null }>();
    if (!current) throw new Error("Group not found.");
    const result = await this.database.prepare("UPDATE activity_groups SET name = ?, sort_order = ?, archived_at = ? WHERE id = ? RETURNING id, name, sort_order, archived_at").bind(patch.name?.trim() || current.name, patch.sortOrder ?? current.sort_order, patch.archived === undefined ? current.archived_at : patch.archived ? new Date().toISOString() : null, id).first<{ id: string; name: string; sort_order: number; archived_at: string | null }>();
    if (!result) throw new Error("Could not update the group.");
    return toGroup(result);
  }

  async createActivity(name: string, groupId: string, icon = "category") {
    const clean = name.trim(); if (!clean) throw new Error("Activity name is required.");
    const id = `activity-${crypto.randomUUID()}`;
    const result = await this.database.prepare("INSERT INTO activities (id, group_id, name, material_icon, sort_order) VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM activities)) RETURNING id, group_id, name, material_icon, source_icon_id, sort_order, archived_at").bind(id, groupId, clean, iconForActivity(clean, icon)).first<{ id: string; group_id: string; name: string; material_icon: string; source_icon_id: string | null; sort_order: number; archived_at: string | null }>();
    if (!result) throw new Error("Could not create the activity.");
    return toActivity(result);
  }

  async updateActivity(id: string, patch: Partial<Pick<Activity, "name" | "groupId" | "icon" | "sortOrder" | "archived">>) {
    const current = await this.database.prepare("SELECT id, group_id, name, material_icon, source_icon_id, sort_order, archived_at FROM activities WHERE id = ?").bind(id).first<{ id: string; group_id: string; name: string; material_icon: string; source_icon_id: string | null; sort_order: number; archived_at: string | null }>();
    if (!current) throw new Error("Activity not found.");
    const result = await this.database.prepare("UPDATE activities SET name = ?, group_id = ?, material_icon = ?, sort_order = ?, archived_at = ? WHERE id = ? RETURNING id, group_id, name, material_icon, source_icon_id, sort_order, archived_at").bind(patch.name?.trim() || current.name, patch.groupId ?? current.group_id, iconForActivity(patch.name?.trim() || current.name, patch.icon ?? current.material_icon), patch.sortOrder ?? current.sort_order, patch.archived ? new Date().toISOString() : patch.archived === false ? null : current.archived_at, id).first<{ id: string; group_id: string; name: string; material_icon: string; source_icon_id: string | null; sort_order: number; archived_at: string | null }>();
    if (!result) throw new Error("Could not update the activity.");
    return toActivity(result);
  }

  async createGoal(input: Pick<Goal, "name" | "activityId" | "scheduleType"> & Partial<Pick<Goal, "targetPerWeek" | "reminderEnabled" | "reminderTime">>) {
    const id = `goal-${crypto.randomUUID()}`;
    const result = await this.database.prepare("INSERT INTO goals (id, activity_id, name, schedule_type, target_per_week, sort_order, reminder_enabled, reminder_time) VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM goals), ?, ?) RETURNING id, activity_id, name, schedule_type, target_per_week, weekdays_mask, sort_order, archived_at, reminder_enabled, reminder_time, source_state").bind(id, input.activityId, input.name.trim() || "Activity goal", input.scheduleType, input.targetPerWeek ?? null, input.reminderEnabled ? 1 : 0, input.reminderTime ?? null).first<{ id: string; activity_id: string; name: string; schedule_type: Goal["scheduleType"]; target_per_week: number | null; weekdays_mask: number | null; sort_order: number; archived_at: string | null; reminder_enabled: number; reminder_time: string | null; source_state: number | null }>();
    if (!result) throw new Error("Could not create the goal.");
    return toGoal(result);
  }

  async updateGoal(id: string, patch: Partial<Goal>) {
    const current = await this.database.prepare("SELECT id, activity_id, name, schedule_type, target_per_week, weekdays_mask, sort_order, archived_at, reminder_enabled, reminder_time, source_state FROM goals WHERE id = ?").bind(id).first<{ id: string; activity_id: string; name: string; schedule_type: Goal["scheduleType"]; target_per_week: number | null; weekdays_mask: number | null; sort_order: number; archived_at: string | null; reminder_enabled: number; reminder_time: string | null; source_state: number | null }>();
    if (!current) throw new Error("Goal not found.");
    const result = await this.database.prepare("UPDATE goals SET name = ?, activity_id = ?, schedule_type = ?, target_per_week = ?, sort_order = ?, reminder_enabled = ?, reminder_time = ?, archived_at = ? WHERE id = ? RETURNING id, activity_id, name, schedule_type, target_per_week, weekdays_mask, sort_order, archived_at, reminder_enabled, reminder_time, source_state").bind(patch.name?.trim() || current.name, patch.activityId ?? current.activity_id, patch.scheduleType ?? current.schedule_type, patch.targetPerWeek ?? current.target_per_week, patch.sortOrder ?? current.sort_order, patch.reminderEnabled === undefined ? current.reminder_enabled : patch.reminderEnabled ? 1 : 0, patch.reminderTime ?? current.reminder_time, patch.archived === undefined ? current.archived_at : patch.archived ? new Date().toISOString() : null, id).first<{ id: string; activity_id: string; name: string; schedule_type: Goal["scheduleType"]; target_per_week: number | null; weekdays_mask: number | null; sort_order: number; archived_at: string | null; reminder_enabled: number; reminder_time: string | null; source_state: number | null }>();
    if (!result) throw new Error("Could not update the goal.");
    return toGoal(result);
  }

  async exportData() {
    const tables = {} as Record<string, unknown[]>;
    for (const table of ["mood_levels", "activity_groups", "activities", "entries", "entry_activities", "goals", "goal_completions", "import_runs"]) tables[table] = await rows(this.database, this.database.prepare(`SELECT * FROM ${table}`));
    return { formatVersion: 1, exportedAt: new Date().toISOString(), tables };
  }

  async importData(payload: ImportPayload) {
    const sourceSha256 = payload.sourceSha256 ?? `manual-${crypto.randomUUID()}`;
    const runId = `import-${sourceSha256.slice(0, 32)}`;
    const reportJson = JSON.stringify({ entries: payload.entries.length, activities: payload.activities.length, goals: payload.goals.length, completions: payload.completions.length });
    const sourceVersion = String((payload as ImportPayload & { backupVersion?: unknown }).backupVersion ?? "");
    await this.database.prepare("INSERT INTO import_runs (id, source_system, source_sha256, source_version, status, report_json, started_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL) ON CONFLICT(source_sha256) DO UPDATE SET status=excluded.status, report_json=excluded.report_json, started_at=excluded.started_at, completed_at=NULL").bind(runId, "daylio", sourceSha256, sourceVersion || null, "running", reportJson, new Date().toISOString()).run();
    try {
      const result = await this.applyImport(payload);
      await this.database.prepare("UPDATE import_runs SET status = ?, completed_at = ?, report_json = ? WHERE id = ?").bind("completed", new Date().toISOString(), JSON.stringify({ entries: payload.entries.length, activities: payload.activities.length, goals: payload.goals.length, completions: payload.completions.length }), runId).run();
      return result;
    } catch (error) {
      try {
        await this.database.prepare("UPDATE import_runs SET status = ?, completed_at = ?, report_json = ? WHERE id = ?").bind("failed", new Date().toISOString(), JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), runId).run();
      } catch {
        // Preserve the original import error if recording the failed run also fails.
      }
      throw error;
    }
  }

  private async applyImport(payload: ImportPayload) {
    // The app's seed data uses a unique score index for the five moods. Reuse
    // an existing mood with the same score (including an earlier import) so a
    // real Daylio import is idempotent instead of colliding with the seed rows.
    const existingMoods = await rows<{ id: string; score: number }>(this.database, this.database.prepare("SELECT id, score FROM mood_levels"));
    const moodIds = new Map(payload.moods.map((item) => [item.sourceId, existingMoods.find((mood) => mood.score === item.score)?.id ?? `daylio-mood-${item.sourceId}`]));
    const groupIds = new Map(payload.groups.map((item) => [item.sourceId, `daylio-group-${item.sourceId}`]));
    const activityIds = new Map(payload.activities.map((item) => [item.sourceId, `daylio-activity-${item.sourceId}`]));
    const goalIds = new Map(payload.goals.map((item) => [item.sourceId, `daylio-goal-${item.sourceId}`]));
    const unresolvedGoalActivitySources = [...new Set(payload.goals.map((item) => item.activitySourceId).filter((sourceId) => !activityIds.has(sourceId)))];
    if (unresolvedGoalActivitySources.length > 0) {
      // Daylio allows goals that are not linked to an activity (id_tag -1),
      // while our UI keeps the relationship convenient and non-null. Store a
      // hidden, archived placeholder activity so those goals and completions
      // remain importable without inventing a real historical activity link.
      const fallbackGroupId = "daylio-group-unlinked-goals";
      await this.database.prepare("INSERT INTO activity_groups (id, name, sort_order, archived_at, source_system, source_id) VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM activity_groups), ?, ?, ?) ON CONFLICT(id) DO NOTHING").bind(fallbackGroupId, "Imported goals", new Date().toISOString(), "daylio", "__unlinked_goals__").run();
      for (const sourceId of unresolvedGoalActivitySources) {
        const fallbackActivityId = `daylio-activity-unlinked-goal-${sourceId}`;
        activityIds.set(sourceId, fallbackActivityId);
        await this.database.prepare("INSERT INTO activities (id, group_id, name, material_icon, sort_order, archived_at, source_system, source_id) VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM activities), ?, ?, ?) ON CONFLICT(id) DO NOTHING").bind(fallbackActivityId, fallbackGroupId, "Imported goal link", "link", new Date().toISOString(), "daylio", `__unlinked_goal_${sourceId}__`).run();
      }
    }
    const allStatements = [
      ...payload.moods.map((item) => this.database.prepare("INSERT INTO mood_levels (id, score, name, emoji, color, sort_order, source_system, source_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, score=excluded.score, emoji=excluded.emoji, source_system=excluded.source_system, source_id=excluded.source_id").bind(moodIds.get(item.sourceId), item.score, item.name, item.emoji ?? "🙂", "#9aa4ae", item.score * -1, "daylio", item.sourceId)),
      ...payload.groups.map((item) => this.database.prepare("INSERT INTO activity_groups (id, name, sort_order, source_system, source_id) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, sort_order=excluded.sort_order").bind(groupIds.get(item.sourceId), item.name, item.sortOrder, "daylio", item.sourceId)),
      ...payload.activities.map((item) => this.database.prepare("INSERT INTO activities (id, group_id, name, material_icon, source_icon_id, source_state, sort_order, source_system, source_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, group_id=excluded.group_id, material_icon=excluded.material_icon, source_state=excluded.source_state, sort_order=excluded.sort_order").bind(activityIds.get(item.sourceId), groupIds.get(item.groupSourceId ?? "") ?? "", item.name, iconForActivity(item.name, item.sourceIconId), item.sourceIconId ?? null, item.sourceState ?? null, item.sortOrder, "daylio", item.sourceId)),
      ...payload.goals.map((item) => this.database.prepare("INSERT INTO goals (id, activity_id, name, schedule_type, target_per_week, weekdays_mask, sort_order, reminder_enabled, reminder_time, source_system, source_id, source_state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, activity_id=excluded.activity_id, source_state=excluded.source_state").bind(goalIds.get(item.sourceId), activityIds.get(item.activitySourceId) ?? "", item.name, item.scheduleType, item.targetPerWeek ?? null, item.weekdaysMask ?? null, item.sortOrder, item.reminderEnabled ? 1 : 0, item.reminderTime ?? null, "daylio", item.sourceId, item.sourceState ?? null)),
    ];
    for (let index = 0; index < allStatements.length; index += 50) await this.database.batch(allStatements.slice(index, index + 50));
    for (const item of payload.entries) {
      const id = `daylio-entry-${item.sourceId}`;
      const timestamp = new Date().toISOString();
      const statements = [this.database.prepare("INSERT INTO entries (id, logical_date, local_time, timezone, timezone_offset_minutes, mood_id, legacy_note_title, legacy_note, version, source_system, source_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET logical_date=excluded.logical_date, mood_id=excluded.mood_id, local_time=excluded.local_time, timezone_offset_minutes=excluded.timezone_offset_minutes, legacy_note_title=excluded.legacy_note_title, legacy_note=excluded.legacy_note").bind(id, item.logicalDate, item.localTime, "", item.timezoneOffsetMinutes ?? null, moodIds.get(item.moodSourceId) ?? "mood-meh", item.legacyNoteTitle ?? null, item.legacyNote ?? null, "daylio", item.sourceId, timestamp, timestamp), this.database.prepare("DELETE FROM entry_activities WHERE entry_id = ?").bind(id)];
      statements.push(...item.activitySourceIds.map((activityId) => this.database.prepare("INSERT OR IGNORE INTO entry_activities (entry_id, activity_id) VALUES (?, ?)").bind(id, activityIds.get(activityId) ?? "")));
      await this.database.batch(statements);
    }
    const entryIdsByDate = new Map(payload.entries.map((item) => [item.logicalDate, `daylio-entry-${item.sourceId}`]));
    const completionStatements = payload.completions.map((item) => this.database.prepare("INSERT OR IGNORE INTO goal_completions (id, goal_id, logical_date, local_time, entry_id, source_system, source_id) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(`daylio-completion-${item.sourceId}`, goalIds.get(item.goalSourceId) ?? "", item.logicalDate, item.localTime ?? null, entryIdsByDate.get(item.logicalDate) ?? null, "daylio", item.sourceId));
    for (let index = 0; index < completionStatements.length; index += 50) await this.database.batch(completionStatements.slice(index, index + 50));
    return this.bootstrap();
  }
}

type AnyStore = DaylioMemoryStore | D1DaylioStore;

export async function getServerStore(): Promise<AnyStore> {
  const database = await databaseOrNull();
  return database ? new D1DaylioStore(database) : memoryStore;
}
