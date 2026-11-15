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

export interface ImportedEntry {
  id: string;
  logicalDate: string;
  localTime: string;
  timezoneOffsetMinutes: number | null;
  moodId: string;
  legacyNoteTitle: string | null;
  legacyNote: string | null;
  sourceId: string;
  activityIds: string[];
}

export interface ImportedCompletion {
  id: string;
  goalId: string;
  logicalDate: string;
  localTime: string | null;
  entryId: string | null;
  sourceId: string;
}

function chunksOf<Item>(items: readonly Item[]): Item[][] {
  const chunks: Item[][] = [];
  for (let start = 0; start < items.length; start += ROWS_PER_STATEMENT) {
    chunks.push(items.slice(start, start + ROWS_PER_STATEMENT));
  }
  return chunks;
}

/**
 * Three statements for each chunk of entries: the entries, then the links
 * that they lose, then the links that they have. A repeat import replaces the
 * activities of an entry with the ones in the backup and counts a new version.
 */
export function planImportedEntries({
  entries,
  importedAt,
}: {
  entries: readonly ImportedEntry[];
  importedAt: string;
}): PlannedStatement<never>[] {
  return chunksOf(entries).flatMap((chunk) => {
    const rows = JSON.stringify(chunk);
    return [
      planRaw({
        sql: `INSERT INTO entries (id, logical_date, local_time, timezone, timezone_offset_minutes, mood_id, legacy_note_title, legacy_note, version, source_system, source_id, created_at, updated_at)
          SELECT json_extract(value, '$.id'), json_extract(value, '$.logicalDate'), json_extract(value, '$.localTime'), '',
            json_extract(value, '$.timezoneOffsetMinutes'), json_extract(value, '$.moodId'),
            json_extract(value, '$.legacyNoteTitle'), json_extract(value, '$.legacyNote'), 1, 'daylio',
            json_extract(value, '$.sourceId'), ?, ?
          FROM json_each(?) WHERE true
          ON CONFLICT(id) DO UPDATE SET logical_date = excluded.logical_date, mood_id = excluded.mood_id,
            local_time = excluded.local_time, timezone_offset_minutes = excluded.timezone_offset_minutes,
            legacy_note_title = excluded.legacy_note_title, legacy_note = excluded.legacy_note,
            version = entries.version + 1, updated_at = excluded.updated_at`,
        parameters: [importedAt, importedAt, rows],
      }),
      planRaw({
        sql: "DELETE FROM entry_activities WHERE entry_id IN (SELECT json_extract(value, '$.id') FROM json_each(?))",
        parameters: [rows],
      }),
      planRaw({
        sql: `INSERT OR IGNORE INTO entry_activities (entry_id, activity_id)
          SELECT json_extract(entry.value, '$.id'), activity.value
          FROM json_each(?) AS entry, json_each(entry.value, '$.activityIds') AS activity`,
        parameters: [rows],
      }),
    ];
  });
}

/** A completion that exists stays as it is. */
export function planImportedCompletions({
  completions,
}: {
  completions: readonly ImportedCompletion[];
}): PlannedStatement<never>[] {
  return chunksOf(completions).map((chunk) =>
    planRaw({
      sql: `INSERT OR IGNORE INTO goal_completions (id, goal_id, logical_date, local_time, entry_id, source_system, source_id)
        SELECT json_extract(value, '$.id'), json_extract(value, '$.goalId'), json_extract(value, '$.logicalDate'),
          json_extract(value, '$.localTime'), json_extract(value, '$.entryId'), 'daylio', json_extract(value, '$.sourceId')
        FROM json_each(?)`,
      parameters: [JSON.stringify(chunk)],
    }),
  );
}
