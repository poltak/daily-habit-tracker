import { sql } from "kysely";
import type {
  CatalogKind,
  SortOrderUpdate,
} from "@app/common/features/catalog/types";
import { isNotNullViolation } from "../../core/database/d1-errors.js";
import {
  planRaw,
  planWrite,
  type PlannedStatement,
} from "../../core/database/planned-statement.js";
import type { BackendStorageProps } from "../../core/storage/types.js";
import {
  SEED_ACTIVITIES,
  SEED_GOALS,
  SEED_GROUPS,
  SEED_MOODS,
} from "../utils/seed-catalog.js";
import {
  planGoalStartDateBackfill,
  planImportedActivities,
  planImportedGoals,
  planImportedGroups,
  planImportedMoods,
  type ImportedActivity,
  type ImportedGoal,
  type ImportedGroup,
  type ImportedMood,
} from "../utils/import-statements.js";
import type {
  ActivityGroupRow,
  ActivityRow,
  GoalRow,
  GoalWrite,
  MoodRow,
} from "./types.js";

/** The table of each kind, as SQL names it. Only these three reach a raw statement. */
const TABLES = {
  group: "activity_groups",
  activity: "activities",
  goal: "goals",
} as const satisfies Record<CatalogKind, string>;

/** The moods, the activity groups, the activities and the goals. */
export class CatalogStorage {
  constructor(private readonly deps: BackendStorageProps) {}

  /** Best mood first. */
  listMoods(): Promise<MoodRow[]> {
    return this.deps.db
      .selectFrom("moodLevels")
      .selectAll()
      .orderBy("score", "desc")
      .execute();
  }

  listGroups(): Promise<ActivityGroupRow[]> {
    return this.deps.db
      .selectFrom("activityGroups")
      .selectAll()
      .orderBy("sortOrder")
      .execute();
  }

  listActivities(): Promise<ActivityRow[]> {
    return this.deps.db
      .selectFrom("activities")
      .selectAll()
      .orderBy("sortOrder")
      .execute();
  }

  listGoals(): Promise<GoalRow[]> {
    return this.deps.db
      .selectFrom("goals")
      .selectAll()
      .orderBy("sortOrder")
      .execute();
  }

  findGroup({ id }: { id: string }): Promise<ActivityGroupRow | undefined> {
    return this.deps.db
      .selectFrom("activityGroups")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
  }

  findActivity({ id }: { id: string }): Promise<ActivityRow | undefined> {
    return this.deps.db
      .selectFrom("activities")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
  }

  findGoal({ id }: { id: string }): Promise<GoalRow | undefined> {
    return this.deps.db
      .selectFrom("goals")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
  }

  /** How many of the items exist. One bound value holds all IDs, so a long list stays under the D1 limit. */
  async countExisting({
    kind,
    ids,
  }: {
    kind: CatalogKind;
    ids: readonly string[];
  }): Promise<number> {
    const result = await sql<{
      count: number;
    }>`select count(*) as count from ${sql.raw(TABLES[kind])} where id in (select value from json_each(${JSON.stringify(ids)}))`.execute(
      this.deps.db,
    );
    return result.rows[0]?.count ?? 0;
  }

  /**
   * Move items in one statement. An item whose sort value is no longer
   * `expectedSortOrder` makes the statement write a NULL into a NOT NULL
   * column, which stops the whole statement. So none of the moves apply.
   */
  async applySortOrders({
    kind,
    updates,
  }: {
    kind: CatalogKind;
    updates: readonly SortOrderUpdate[];
  }): Promise<"applied" | "stale"> {
    const table = TABLES[kind];
    const json = JSON.stringify(updates);
    try {
      await sql`update ${sql.raw(table)} set sort_order = (
        select case when ${sql.raw(table)}.sort_order = json_extract(value, '$.expectedSortOrder')
          then json_extract(value, '$.sortOrder') else null end
        from json_each(${json}) where json_extract(value, '$.id') = ${sql.raw(table)}.id
      ) where id in (select json_extract(value, '$.id') from json_each(${json}))`.execute(
        this.deps.db,
      );
      return "applied";
    } catch (error) {
      if (isNotNullViolation({ error, column: `${table}.sort_order` })) {
        return "stale";
      }
      throw error;
    }
  }

  /**
   * The rows of a new journal. `insert or ignore` keeps a row that exists, so
   * two first requests at once do no harm. One statement for each row, because
   * a D1 statement binds one row of values.
   */
  planSeedCatalog(): PlannedStatement<never>[] {
    return [SEED_MOODS, SEED_GROUPS, SEED_ACTIVITIES, SEED_GOALS].flatMap(
      (insert) =>
        insert.rows.map((row) => planRaw({ sql: insert.sql, parameters: row })),
    );
  }

  /** The new group goes last. The subquery reads the order in the same statement as the insert. */
  planInsertGroup({
    id,
    name,
  }: {
    id: string;
    name: string;
  }): PlannedStatement<never> {
    return planRaw({
      sql: "insert into activity_groups (id, name, sort_order) values (?, ?, (select coalesce(max(sort_order), -1) + 1 from activity_groups))",
      parameters: [id, name],
    });
  }

  planInsertActivity({
    id,
    groupId,
    name,
    icon,
  }: {
    id: string;
    groupId: string;
    name: string;
    icon: string;
  }): PlannedStatement<never> {
    return planRaw({
      sql: "insert into activities (id, group_id, name, material_icon, sort_order) values (?, ?, ?, ?, (select coalesce(max(sort_order), -1) + 1 from activities))",
      parameters: [id, groupId, name, icon],
    });
  }

  planInsertGoal(
    goal: GoalWrite & { startDate: string },
  ): PlannedStatement<never> {
    return planRaw({
      sql: "insert into goals (id, activity_id, name, material_icon, repeat_type, schedule_type, target_per_week, weekdays_mask, start_date, sort_order, reminder_enabled, reminder_time) values (?, ?, ?, ?, ?, ?, ?, ?, ?, (select coalesce(max(sort_order), -1) + 1 from goals), ?, ?)",
      parameters: [
        goal.id,
        goal.activityId,
        goal.name,
        goal.materialIcon,
        goal.repeatType,
        goal.scheduleType,
        goal.targetPerWeek,
        goal.weekdaysMask,
        goal.startDate,
        goal.reminderEnabled ? 1 : 0,
        goal.reminderTime,
      ],
    });
  }

  planUpdateGroup({
    id,
    name,
    sortOrder,
    archivedAt,
  }: {
    id: string;
    name: string;
    sortOrder: number;
    archivedAt: string | null;
  }): PlannedStatement<never> {
    return planWrite(
      this.deps.db
        .updateTable("activityGroups")
        .set({ name, sortOrder, archivedAt })
        .where("id", "=", id),
    );
  }

  planUpdateActivity({
    id,
    name,
    groupId,
    icon,
    sortOrder,
    archivedAt,
  }: {
    id: string;
    name: string;
    groupId: string;
    icon: string;
    sortOrder: number;
    archivedAt: string | null;
  }): PlannedStatement<never> {
    return planWrite(
      this.deps.db
        .updateTable("activities")
        .set({ name, groupId, materialIcon: icon, sortOrder, archivedAt })
        .where("id", "=", id),
    );
  }

  planUpdateGoal(
    goal: GoalWrite & { sortOrder: number; archivedAt: string | null },
  ): PlannedStatement<never> {
    return planWrite(
      this.deps.db
        .updateTable("goals")
        .set({
          name: goal.name,
          activityId: goal.activityId,
          materialIcon: goal.materialIcon,
          repeatType: goal.repeatType,
          scheduleType: goal.scheduleType,
          targetPerWeek: goal.targetPerWeek,
          weekdaysMask: goal.weekdaysMask,
          sortOrder: goal.sortOrder,
          reminderEnabled: goal.reminderEnabled ? 1 : 0,
          reminderTime: goal.reminderTime,
          archivedAt: goal.archivedAt,
        })
        .where("id", "=", goal.id),
    );
  }

  /**
   * Delete the activities that match, and every record of them on a day. A
   * goal that was linked to one stays, without an activity.
   */
  planDeleteActivities({
    column,
    value,
  }: {
    column: "id" | "group_id";
    value: string;
  }): PlannedStatement<never>[] {
    const selected = `select id from activities where ${column} = ?`;
    return [
      planRaw({
        sql: `delete from entry_activities where activity_id in (${selected})`,
        parameters: [value],
      }),
      planRaw({
        sql: `delete from day_activity_selections where activity_id in (${selected})`,
        parameters: [value],
      }),
      planRaw({
        sql: `update goals set activity_id = null where activity_id in (${selected})`,
        parameters: [value],
      }),
      planRaw({
        sql: `delete from activities where ${column} = ?`,
        parameters: [value],
      }),
    ];
  }

  planDeleteGroup({ id }: { id: string }): PlannedStatement<never> {
    return planWrite(
      this.deps.db.deleteFrom("activityGroups").where("id", "=", id),
    );
  }

  /** The goal and its completion history. */
  planDeleteGoal({ id }: { id: string }): PlannedStatement<never>[] {
    return [
      planWrite(
        this.deps.db.deleteFrom("goalCompletions").where("goalId", "=", id),
      ),
      planWrite(this.deps.db.deleteFrom("goals").where("id", "=", id)),
    ];
  }

  planImportMoods(input: {
    moods: readonly ImportedMood[];
  }): PlannedStatement<never>[] {
    return planImportedMoods(input);
  }

  planImportGroups(input: {
    groups: readonly ImportedGroup[];
  }): PlannedStatement<never>[] {
    return planImportedGroups(input);
  }

  planImportActivities(input: {
    activities: readonly ImportedActivity[];
  }): PlannedStatement<never>[] {
    return planImportedActivities(input);
  }

  planImportGoals(input: {
    goals: readonly ImportedGoal[];
  }): PlannedStatement<never>[] {
    return planImportedGoals(input);
  }

  /** It must run after the statements that write the goal completions. */
  planBackfillGoalStartDates(): PlannedStatement<never> {
    return planGoalStartDateBackfill();
  }
}
