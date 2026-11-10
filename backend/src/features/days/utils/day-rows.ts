import type {
  DaySelections,
  DayState,
  Entry,
} from "@app/common/features/days/types";
import type {
  ActivitySelectionRow,
  DayRows,
  EntryRow,
} from "../storage/types.js";

/** The time an entry has when its row has none. */
const DEFAULT_LOCAL_TIME = "23:00";

export function toEntry({
  row,
  activityIds,
  completedGoalIds,
  moodId,
}: {
  row: EntryRow;
  activityIds: string[];
  completedGoalIds: string[];
  moodId: string;
}): Entry {
  return {
    id: row.id,
    logicalDate: row.logicalDate,
    localTime: row.localTime ?? DEFAULT_LOCAL_TIME,
    timezone: row.timezone ?? "",
    ...(row.timezoneOffsetMinutes === null
      ? {}
      : { timezoneOffsetMinutes: row.timezoneOffsetMinutes }),
    moodId,
    activityIds,
    completedGoalIds,
    ...(row.legacyNoteTitle === null
      ? {}
      : { legacyNoteTitle: row.legacyNoteTitle }),
    ...(row.legacyNote === null ? {} : { legacyNote: row.legacyNote }),
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.deletedAt === null ? {} : { deletedAt: row.deletedAt }),
  };
}

/** The saved activities, with each tap of the owner applied: on adds, off removes. */
export function applySelections({
  saved,
  selections,
}: {
  saved: Iterable<string>;
  selections: readonly ActivitySelectionRow[];
}): Set<string> {
  const activityIds = new Set(saved);
  for (const selection of selections) {
    if (selection.selected) {
      activityIds.add(selection.activityId);
    } else {
      activityIds.delete(selection.activityId);
    }
  }
  return activityIds;
}

export function toDayState({
  logicalDate,
  rows,
}: {
  logicalDate: string;
  rows: DayRows;
}): DayState {
  const moodId = rows.pendingMoodId ?? rows.entry?.moodId ?? null;
  const activityIds = [
    ...applySelections({ saved: rows.links, selections: rows.selections }),
  ];
  const daySelections: DaySelections = {
    logicalDate,
    moodId,
    activityIds,
    moodOverride: rows.pendingMoodId !== undefined,
    activityOverrideIds: rows.selections.map((row) => row.activityId),
  };
  return {
    entry: rows.entry
      ? toEntry({
          row: rows.entry,
          activityIds,
          completedGoalIds: rows.completedGoalIds,
          moodId: moodId ?? rows.entry.moodId,
        })
      : null,
    completedGoalIds: rows.completedGoalIds,
    daySelections,
  };
}
