import { sql } from "kysely";
import { isNotNullViolation } from "../../core/database/d1-errors.js";
import {
  planRaw,
  planWrite,
  type PlannedStatement,
} from "../../core/database/planned-statement.js";
import type { BackendStorageProps } from "../../core/storage/types.js";
import { readEntriesOfPage, type EntryPageRows } from "./entry-read-storage.js";
import {
  planImportedCompletions,
  planImportedEntries,
  type ImportedCompletion,
  type ImportedEntry,
} from "../utils/import-statements.js";
import type {
  ActivityLink,
  ActivitySelectionRow,
  DayRows,
  EffectiveDayRow,
  EntryRow,
  EntryWrite,
} from "./types.js";

/** D1 binds at most 100 values in one statement. */
const MAX_IDS_PER_STATEMENT = 90;

function chunksOf<Item>(items: readonly Item[]): Item[][] {
  const chunks: Item[][] = [];
  for (let start = 0; start < items.length; start += MAX_IDS_PER_STATEMENT) {
    chunks.push(items.slice(start, start + MAX_IDS_PER_STATEMENT));
  }
  return chunks;
}

/**
 * The entries of the days, the taps that wait for a save (the day selections),
 * and the goal completions of a day. It reads the mood, activity and goal
 * tables only to check that an ID exists and to find the goals of an activity.
 */
export class DaysStorage {
  constructor(private readonly deps: BackendStorageProps) {}

  // ---------- Reads ----------

  /** The row of a day, also when the entry was deleted. */
  findEntryRow({
    logicalDate,
  }: {
    logicalDate: string;
  }): Promise<EntryRow | undefined> {
    return this.deps.db
      .selectFrom("entries")
      .selectAll()
      .where("logicalDate", "=", logicalDate)
      .executeTakeFirst();
  }

  /** Everything that decides what a day shows. */
  async readDayRows({
    logicalDate,
  }: {
    logicalDate: string;
  }): Promise<DayRows> {
    const { db } = this.deps;
    const [entry, mood, selections, links, completions] = await Promise.all([
      db
        .selectFrom("entries")
        .selectAll()
        .where("logicalDate", "=", logicalDate)
        .where("deletedAt", "is", null)
        .executeTakeFirst(),
      db
        .selectFrom("dayMoodSelections")
        .select("moodId")
        .where("logicalDate", "=", logicalDate)
        .executeTakeFirst(),
      db
        .selectFrom("dayActivitySelections")
        .select(["logicalDate", "activityId", "selected"])
        .where("logicalDate", "=", logicalDate)
        .orderBy("activityId")
        .execute(),
      db
        .selectFrom("entries")
        .innerJoin("entryActivities", "entryActivities.entryId", "entries.id")
        .select("entryActivities.activityId")
        .where("entries.logicalDate", "=", logicalDate)
        .where("entries.deletedAt", "is", null)
        .orderBy("entryActivities.activityId")
        .execute(),
      db
        .selectFrom("goalCompletions")
        .select("goalId")
        .where("logicalDate", "=", logicalDate)
        .orderBy("goalId")
        .execute(),
    ]);
    return {
      entry,
      pendingMoodId: mood?.moodId,
      selections,
      links: links.map((link) => link.activityId),
      completedGoalIds: completions.map((completion) => completion.goalId),
    };
  }

  /** One page of saved entries, newest first, with the rows that belong to it. */
  readEntryPage({
    limit,
    offset,
  }: {
    limit: number;
    offset: number;
  }): Promise<EntryPageRows> {
    return readEntriesOfPage({
      db: this.deps.db,
      newestFirst: true,
      page: sql`with page as (
        select * from entries where deleted_at is null
        order by logical_date desc limit ${limit} offset ${offset}
      )`,
    });
  }

  /** The saved entries from `startDate` to `endDate`, oldest first, with the rows that belong to them. */
  readEntryRange({
    startDate,
    endDate,
  }: {
    startDate: string;
    endDate: string;
  }): Promise<EntryPageRows> {
    return readEntriesOfPage({
      db: this.deps.db,
      newestFirst: false,
      page: sql`with page as (
        select * from entries where deleted_at is null
          and logical_date between ${startDate} and ${endDate}
        order by logical_date
      )`,
    });
  }

  /** The first and the last saved day, and how many days have an entry. */
  async readHistorySpan(): Promise<{
    firstDate: string | null;
    lastDate: string | null;
    recordedDays: number;
  }> {
    const { rows } = await sql<{
      firstDate: string | null;
      lastDate: string | null;
      recordedDays: number;
    }>`select min(logical_date) as first_date, max(logical_date) as last_date,
        count(*) as recorded_days
      from entries where deleted_at is null`.execute(this.deps.db);
    return rows[0] ?? { firstDate: null, lastDate: null, recordedDays: 0 };
  }

  /** The days of a range on which a goal is complete, and the first such day on any date. */
  async readGoalCompletionDates({
    goalId,
    startDate,
    endDate,
  }: {
    goalId: string;
    startDate: string;
    endDate: string;
  }): Promise<{ dates: string[]; firstDate: string | null }> {
    const { db } = this.deps;
    const [dates, first] = await Promise.all([
      db
        .selectFrom("goalCompletions")
        .select("logicalDate")
        .where("goalId", "=", goalId)
        .where("logicalDate", ">=", startDate)
        .where("logicalDate", "<=", endDate)
        .orderBy("logicalDate")
        .execute(),
      db
        .selectFrom("goalCompletions")
        .select((builder) => builder.fn.min("logicalDate").as("logicalDate"))
        .where("goalId", "=", goalId)
        .executeTakeFirst(),
    ]);
    return {
      dates: dates.map((row) => row.logicalDate),
      firstDate: first?.logicalDate ?? null,
    };
  }

  /** The entry that each of `dates` has, also when it was deleted, with its ID. */
  async listEntryIdsOfDates({
    dates,
  }: {
    dates: readonly string[];
  }): Promise<{ id: string; logicalDate: string }[]> {
    const { rows } = await sql<{ id: string; logicalDate: string }>`
      select id, logical_date from entries
      where logical_date in (select value from json_each(${JSON.stringify(dates)}))`.execute(
      this.deps.db,
    );
    return rows;
  }

  /** Every row of the tables of the days, for the export file. */
  async listAllForExport(): Promise<{
    entries: Record<string, unknown>[];
    entryActivities: Record<string, unknown>[];
    dayMoodSelections: Record<string, unknown>[];
    dayActivitySelections: Record<string, unknown>[];
    goalCompletions: Record<string, unknown>[];
  }> {
    const { db } = this.deps;
    const [
      entries,
      entryActivities,
      dayMoodSelections,
      dayActivitySelections,
      goalCompletions,
    ] = await Promise.all([
      db.selectFrom("entries").selectAll().orderBy("logicalDate").execute(),
      db
        .selectFrom("entryActivities")
        .selectAll()
        .orderBy("entryId")
        .orderBy("activityId")
        .execute(),
      db
        .selectFrom("dayMoodSelections")
        .selectAll()
        .orderBy("logicalDate")
        .execute(),
      db
        .selectFrom("dayActivitySelections")
        .selectAll()
        .orderBy("logicalDate")
        .orderBy("activityId")
        .execute(),
      db
        .selectFrom("goalCompletions")
        .selectAll()
        .orderBy("logicalDate")
        .orderBy("goalId")
        .execute(),
    ]);
    return {
      entries,
      entryActivities,
      dayMoodSelections,
      dayActivitySelections,
      goalCompletions,
    };
  }

  /**
   * Every saved day of a range, with the rows that decide its mood and its
   * activities. Each query joins the entries of the range, so that it binds
   * only the two dates, however many days the journal has.
   */
  async readEffectiveDayRows({
    startDate,
    endDate,
  }: {
    startDate: string;
    endDate: string;
  }): Promise<{
    entries: EffectiveDayRow[];
    links: ActivityLink[];
    selections: ActivitySelectionRow[];
  }> {
    const { db } = this.deps;
    const [entries, links, selections] = await Promise.all([
      sql<EffectiveDayRow>`
        select entries.id, entries.logical_date,
          coalesce(selection.mood_id, entries.mood_id) as effective_mood_id
        from entries left join day_mood_selections as selection
          on selection.logical_date = entries.logical_date
        where entries.deleted_at is null
          and entries.logical_date between ${startDate} and ${endDate}
        order by entries.logical_date`.execute(db),
      sql<ActivityLink>`
        select link.entry_id, link.activity_id
        from entry_activities as link join entries on entries.id = link.entry_id
        where entries.deleted_at is null
          and entries.logical_date between ${startDate} and ${endDate}
        order by link.entry_id, link.activity_id`.execute(db),
      sql<ActivitySelectionRow>`
        select selection.logical_date, selection.activity_id, selection.selected
        from day_activity_selections as selection
          join entries on entries.logical_date = selection.logical_date
        where entries.deleted_at is null
          and entries.logical_date between ${startDate} and ${endDate}
        order by selection.logical_date, selection.activity_id`.execute(db),
    ]);
    return {
      entries: entries.rows,
      links: links.rows,
      selections: selections.rows,
    };
  }

  /** The saved days of a range, with the mood that the owner sees for each. */
  async listCalendarDays({
    startDate,
    endDate,
  }: {
    startDate: string;
    endDate: string;
  }): Promise<{ logicalDate: string; moodId: string }[]> {
    const { rows } = await sql<{ logicalDate: string; moodId: string }>`
      select entries.logical_date,
        coalesce(selection.mood_id, entries.mood_id) as mood_id
      from entries left join day_mood_selections as selection
        on selection.logical_date = entries.logical_date
      where entries.deleted_at is null
        and entries.logical_date between ${startDate} and ${endDate}
      order by entries.logical_date`.execute(this.deps.db);
    return rows;
  }

  async moodExists({ id }: { id: string }): Promise<boolean> {
    const row = await this.deps.db
      .selectFrom("moodLevels")
      .select("id")
      .where("id", "=", id)
      .executeTakeFirst();
    return row !== undefined;
  }

  async activityExists({ id }: { id: string }): Promise<boolean> {
    const row = await this.deps.db
      .selectFrom("activities")
      .select("id")
      .where("id", "=", id)
      .executeTakeFirst();
    return row !== undefined;
  }

  /** Which of `ids` are activities. */
  async findActivityIds({
    ids,
  }: {
    ids: readonly string[];
  }): Promise<Set<string>> {
    const found = await Promise.all(
      chunksOf([...new Set(ids)]).map((chunk) =>
        this.deps.db
          .selectFrom("activities")
          .select("id")
          .where("id", "in", chunk)
          .execute(),
      ),
    );
    return new Set(found.flat().map((row) => row.id));
  }

  /** Which of `ids` are goals. */
  async findGoalIds({ ids }: { ids: readonly string[] }): Promise<Set<string>> {
    const found = await Promise.all(
      chunksOf([...new Set(ids)]).map((chunk) =>
        this.deps.db
          .selectFrom("goals")
          .select("id")
          .where("id", "in", chunk)
          .execute(),
      ),
    );
    return new Set(found.flat().map((row) => row.id));
  }

  /** The goals that an activity completes. An archived goal does not count. */
  async listGoalIdsOfActivity({
    activityId,
  }: {
    activityId: string;
  }): Promise<string[]> {
    const rows = await this.deps.db
      .selectFrom("goals")
      .select("id")
      .where("activityId", "=", activityId)
      .where("archivedAt", "is", null)
      .orderBy("id")
      .execute();
    return rows.map((row) => row.id);
  }

  async listGoalLinks(): Promise<
    { id: string; activityId: string | null; archived: boolean }[]
  > {
    const rows = await this.deps.db
      .selectFrom("goals")
      .select(["id", "activityId", "archivedAt"])
      .execute();
    return rows.map((row) => ({
      id: row.id,
      activityId: row.activityId,
      archived: row.archivedAt !== null,
    }));
  }

  /** True when a save failed because another save changed the entry first. */
  isVersionConflict(error: unknown): boolean {
    return isNotNullViolation({ error, column: "entries.version" });
  }

  // ---------- Plans ----------

  /**
   * Write an entry. The mood that the owner tapped wins over `moodId`. When
   * the row exists, the new version is the old one plus one, and any other
   * version sets the version to `null`. `NOT NULL` then stops the whole batch,
   * so a save that lost a race changes nothing.
   */
  planUpsertEntry(write: EntryWrite): PlannedStatement<never> {
    return planRaw({
      sql: `INSERT INTO entries (id, logical_date, local_time, timezone, timezone_offset_minutes, mood_id, legacy_note_title, legacy_note, version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, COALESCE((SELECT mood_id FROM day_mood_selections WHERE logical_date = ?), ?), ?, ?, 1, ?, ?)
        ON CONFLICT(logical_date) DO UPDATE SET
          local_time = excluded.local_time, timezone = excluded.timezone,
          timezone_offset_minutes = excluded.timezone_offset_minutes, mood_id = excluded.mood_id,
          legacy_note_title = excluded.legacy_note_title, legacy_note = excluded.legacy_note,
          version = CASE WHEN entries.version = ? AND entries.deleted_at IS ? THEN entries.version + 1 ELSE NULL END,
          created_at = excluded.created_at, updated_at = excluded.updated_at, deleted_at = NULL`,
      parameters: [
        write.id,
        write.logicalDate,
        write.localTime,
        write.timezone,
        write.timezoneOffsetMinutes,
        write.logicalDate,
        write.moodId,
        write.legacyNoteTitle,
        write.legacyNote,
        write.createdAt,
        write.updatedAt,
        write.replaces.version,
        write.replaces.deletedAt,
      ],
    });
  }

  planDeleteEntryActivities({
    entryId,
  }: {
    entryId: string;
  }): PlannedStatement<never> {
    return planRaw({
      sql: "DELETE FROM entry_activities WHERE entry_id = ?",
      parameters: [entryId],
    });
  }

  /**
   * The activities of the entry: the given ones, without those that the owner
   * tapped off, and with those that the owner tapped on.
   */
  planInsertEntryActivities({
    entryId,
    logicalDate,
    activityIds,
  }: {
    entryId: string;
    logicalDate: string;
    activityIds: readonly string[];
  }): PlannedStatement<never> {
    return planRaw({
      sql: `INSERT INTO entry_activities (entry_id, activity_id)
        SELECT ?, value FROM json_each(?) WHERE NOT EXISTS (
          SELECT 1 FROM day_activity_selections WHERE logical_date = ? AND activity_id = value AND selected = 0
        )
        UNION SELECT ?, activity_id FROM day_activity_selections WHERE logical_date = ? AND selected = 1`,
      parameters: [
        entryId,
        JSON.stringify(activityIds),
        logicalDate,
        entryId,
        logicalDate,
      ],
    });
  }

  planLinkCompletionsToEntry({
    logicalDate,
    entryId,
    timestamp,
  }: {
    logicalDate: string;
    entryId: string;
    timestamp: string;
  }): PlannedStatement<never> {
    return planRaw({
      sql: "UPDATE goal_completions SET entry_id = ?, updated_at = ? WHERE logical_date = ?",
      parameters: [entryId, timestamp, logicalDate],
    });
  }

  /** A save of the day takes the place of the taps that waited for it. */
  planClearSelections({
    logicalDate,
  }: {
    logicalDate: string;
  }): PlannedStatement<never>[] {
    return [
      planWrite(
        this.deps.db
          .deleteFrom("dayMoodSelections")
          .where("logicalDate", "=", logicalDate),
      ),
      planWrite(
        this.deps.db
          .deleteFrom("dayActivitySelections")
          .where("logicalDate", "=", logicalDate),
      ),
    ];
  }

  planUpsertMoodSelection({
    logicalDate,
    moodId,
    timestamp,
  }: {
    logicalDate: string;
    moodId: string;
    timestamp: string;
  }): PlannedStatement<never> {
    return planRaw({
      sql: `INSERT INTO day_mood_selections (logical_date, mood_id, created_at, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(logical_date) DO UPDATE SET mood_id = excluded.mood_id, updated_at = excluded.updated_at`,
      parameters: [logicalDate, moodId, timestamp, timestamp],
    });
  }

  planUpsertActivitySelection({
    logicalDate,
    activityId,
    selected,
    timestamp,
  }: {
    logicalDate: string;
    activityId: string;
    selected: boolean;
    timestamp: string;
  }): PlannedStatement<never> {
    return planRaw({
      sql: `INSERT INTO day_activity_selections (logical_date, activity_id, selected, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(logical_date, activity_id) DO UPDATE SET selected = excluded.selected, updated_at = excluded.updated_at`,
      parameters: [
        logicalDate,
        activityId,
        selected ? 1 : 0,
        timestamp,
        timestamp,
      ],
    });
  }

  planUpsertCompletion({
    goalId,
    logicalDate,
    entryId,
    timestamp,
  }: {
    goalId: string;
    logicalDate: string;
    entryId: string | null;
    timestamp: string;
  }): PlannedStatement<never> {
    return planRaw({
      sql: `INSERT INTO goal_completions (id, goal_id, logical_date, entry_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(goal_id, logical_date) DO UPDATE SET entry_id = excluded.entry_id, updated_at = excluded.updated_at`,
      parameters: [
        `completion-${goalId}-${logicalDate}`,
        goalId,
        logicalDate,
        entryId,
        timestamp,
        timestamp,
      ],
    });
  }

  planDeleteCompletion({
    goalId,
    logicalDate,
  }: {
    goalId: string;
    logicalDate: string;
  }): PlannedStatement<never> {
    return planRaw({
      sql: "DELETE FROM goal_completions WHERE goal_id = ? AND logical_date = ?",
      parameters: [goalId, logicalDate],
    });
  }

  planDeleteCompletions({
    logicalDate,
    goalIds,
  }: {
    logicalDate: string;
    goalIds: readonly string[];
  }): PlannedStatement<never> {
    return planRaw({
      sql: "DELETE FROM goal_completions WHERE logical_date = ? AND goal_id IN (SELECT value FROM json_each(?))",
      parameters: [logicalDate, JSON.stringify(goalIds)],
    });
  }

  planInsertCompletions({
    logicalDate,
    goalIds,
    timestamp,
  }: {
    logicalDate: string;
    goalIds: readonly string[];
    timestamp: string;
  }): PlannedStatement<never> {
    return planRaw({
      sql: `INSERT INTO goal_completions (id, goal_id, logical_date, created_at, updated_at)
        SELECT 'completion-' || value || '-' || ?, value, ?, ?, ? FROM json_each(?) WHERE true
        ON CONFLICT(goal_id, logical_date) DO UPDATE SET updated_at = excluded.updated_at`,
      parameters: [
        logicalDate,
        logicalDate,
        timestamp,
        timestamp,
        JSON.stringify(goalIds),
      ],
    });
  }

  /** Mark the entry deleted. It changes no row when the version is not `version`. */
  planDeleteEntry({
    logicalDate,
    version,
    timestamp,
  }: {
    logicalDate: string;
    version: number;
    timestamp: string;
  }): PlannedStatement<never> {
    return planRaw({
      sql: `UPDATE entries SET deleted_at = ?, updated_at = ?, version = version + 1
        WHERE logical_date = ? AND version = ? AND deleted_at IS NULL`,
      parameters: [timestamp, timestamp, logicalDate, version],
    });
  }

  /** The entries of a backup, with their activities. See `planImportedEntries`. */
  planImportEntries(input: {
    entries: readonly ImportedEntry[];
    importedAt: string;
  }): PlannedStatement<never>[] {
    return planImportedEntries(input);
  }

  planImportCompletions(input: {
    completions: readonly ImportedCompletion[];
  }): PlannedStatement<never>[] {
    return planImportedCompletions(input);
  }
}
