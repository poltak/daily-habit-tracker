import {
  planRaw,
  type PlannedStatement,
} from "../../core/database/planned-statement.js";

/**
 * An import binds its rows as JSON text and reads them with `json_each`, so
 * one statement writes many rows and binds one value. A statement with this
 * many rows keeps its JSON far below the size limit of a D1 value.
 */
const ROWS_PER_STATEMENT = 200;

export interface ImportedMood {
  id: string;
  score: number;
  name: string;
  emoji: string;
  color: string;
  sortOrder: number;
  sourceId: string;
}

export interface ImportedGroup {
  id: string;
  name: string;
  sortOrder: number;
  archivedAt: string | null;
  sourceId: string;
}

export interface ImportedActivity {
  id: string;
  groupId: string;
  name: string;
  materialIcon: string;
  sourceIconId: string | null;
  sourceState: number | null;
  sortOrder: number;
  archivedAt: string | null;
  sourceId: string;
}

export interface ImportedGoal {
  id: string;
  activityId: string | null;
  name: string;
  materialIcon: string;
  repeatType: string;
  scheduleType: string;
  targetPerWeek: number | null;
  weekdaysMask: number | null;
  sortOrder: number;
  reminderEnabled: number;
  reminderTime: string | null;
  archivedAt: string | null;
  sourceId: string;
  sourceState: number | null;
}

function statementsOf<Row>({
  rows,
  sql,
}: {
  rows: readonly Row[];
  sql: string;
}): PlannedStatement<never>[] {
  const statements: PlannedStatement<never>[] = [];
  for (let start = 0; start < rows.length; start += ROWS_PER_STATEMENT) {
    statements.push(
      planRaw({
        sql,
        parameters: [
          JSON.stringify(rows.slice(start, start + ROWS_PER_STATEMENT)),
        ],
      }),
    );
  }
  return statements;
}

/**
 * A mood that exists is changed: the five standard moods keep their ids, and
 * the unique score would refuse a second mood with the same score.
 */
export function planImportedMoods({
  moods,
}: {
  moods: readonly ImportedMood[];
}): PlannedStatement<never>[] {
  return statementsOf({
    rows: moods,
    sql: `INSERT INTO mood_levels (id, score, name, emoji, color, sort_order, source_system, source_id)
      SELECT json_extract(value, '$.id'), json_extract(value, '$.score'), json_extract(value, '$.name'),
        json_extract(value, '$.emoji'), json_extract(value, '$.color'), json_extract(value, '$.sortOrder'),
        'daylio', json_extract(value, '$.sourceId')
      FROM json_each(?) WHERE true
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, score = excluded.score, emoji = excluded.emoji,
        color = excluded.color, source_system = excluded.source_system, source_id = excluded.source_id`,
  });
}

export function planImportedGroups({
  groups,
}: {
  groups: readonly ImportedGroup[];
}): PlannedStatement<never>[] {
  return statementsOf({
    rows: groups,
    sql: `INSERT INTO activity_groups (id, name, sort_order, archived_at, source_system, source_id)
      SELECT json_extract(value, '$.id'), json_extract(value, '$.name'), json_extract(value, '$.sortOrder'),
        json_extract(value, '$.archivedAt'), 'daylio', json_extract(value, '$.sourceId')
      FROM json_each(?) WHERE true
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, sort_order = excluded.sort_order,
        archived_at = excluded.archived_at`,
  });
}

export function planImportedActivities({
  activities,
}: {
  activities: readonly ImportedActivity[];
}): PlannedStatement<never>[] {
  return statementsOf({
    rows: activities,
    sql: `INSERT INTO activities (id, group_id, name, material_icon, source_icon_id, source_state, sort_order, archived_at, source_system, source_id)
      SELECT json_extract(value, '$.id'), json_extract(value, '$.groupId'), json_extract(value, '$.name'),
        json_extract(value, '$.materialIcon'), json_extract(value, '$.sourceIconId'),
        json_extract(value, '$.sourceState'), json_extract(value, '$.sortOrder'),
        json_extract(value, '$.archivedAt'), 'daylio', json_extract(value, '$.sourceId')
      FROM json_each(?) WHERE true
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, group_id = excluded.group_id,
        material_icon = excluded.material_icon, source_icon_id = excluded.source_icon_id,
        source_state = excluded.source_state, sort_order = excluded.sort_order,
        archived_at = excluded.archived_at`,
  });
}

export function planImportedGoals({
  goals,
}: {
  goals: readonly ImportedGoal[];
}): PlannedStatement<never>[] {
  return statementsOf({
    rows: goals,
    sql: `INSERT INTO goals (id, activity_id, name, material_icon, repeat_type, schedule_type, target_per_week, weekdays_mask, sort_order, reminder_enabled, reminder_time, archived_at, source_system, source_id, source_state)
      SELECT json_extract(value, '$.id'), json_extract(value, '$.activityId'), json_extract(value, '$.name'),
        json_extract(value, '$.materialIcon'), json_extract(value, '$.repeatType'),
        json_extract(value, '$.scheduleType'), json_extract(value, '$.targetPerWeek'),
        json_extract(value, '$.weekdaysMask'), json_extract(value, '$.sortOrder'),
        json_extract(value, '$.reminderEnabled'), json_extract(value, '$.reminderTime'),
        json_extract(value, '$.archivedAt'), 'daylio', json_extract(value, '$.sourceId'),
        json_extract(value, '$.sourceState')
      FROM json_each(?) WHERE true
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, activity_id = excluded.activity_id,
        material_icon = excluded.material_icon, repeat_type = excluded.repeat_type,
        schedule_type = excluded.schedule_type, target_per_week = excluded.target_per_week,
        weekdays_mask = excluded.weekdays_mask, source_state = excluded.source_state,
        sort_order = excluded.sort_order, reminder_enabled = excluded.reminder_enabled,
        reminder_time = excluded.reminder_time, archived_at = excluded.archived_at`,
  });
}

/** An imported goal starts on its first completion, or on its import date when it has none. */
export function planGoalStartDateBackfill(): PlannedStatement<never> {
  return planRaw({
    sql: `UPDATE goals SET start_date = COALESCE(
        (SELECT MIN(logical_date) FROM goal_completions WHERE goal_completions.goal_id = goals.id),
        substr(created_at, 1, 10)
      ) WHERE start_date IS NULL`,
  });
}
