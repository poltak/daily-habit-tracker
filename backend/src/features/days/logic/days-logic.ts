import { Logic } from "@app/common/features/core/logic/logic";
import {
  isLogicalDate,
  isMonth,
  latestStartedDate,
  monthDateRange,
} from "@app/common/features/core/utils/logical-date";
import type { DaylioBackup, ImportIds } from "../../import/types.js";
import type {
  CalendarEntryDay,
  DayActivitySelection,
  DayState,
  EffectiveDay,
  Entry,
  GoalCompletion,
} from "@app/common/features/days/types";
import { AppError } from "../../core/errors/app-error.js";
import type { PlannedStatement } from "../../core/database/planned-statement.js";
import type {
  BackendAtomicProps,
  BackendLogicProps,
  PlanningStorage,
} from "../../core/logic/types.js";
import type { EntryPageRows } from "../storage/entry-read-storage.js";
import type { ActivitySelectionRow, EntryWrite } from "../storage/types.js";
import { applySelections, toDayState, toEntry } from "../utils/day-rows.js";
import type { DayInput, EntryInput } from "../utils/entry-input.js";
import { planDaySave } from "../utils/plan-day-save.js";

type DaysProps = BackendLogicProps<"days", "clock"> & BackendAtomicProps;

/** The time an entry has when the save names none. */
const DEFAULT_LOCAL_TIME = "23:00";

/** The bounds of a read of the whole journal. */
const EARLIEST_DATE = "0001-01-01";
const LATEST_DATE = "9999-12-31";

function invalid(message: string): AppError {
  return new AppError({ code: "INVALID_REQUEST", message });
}

function versionConflict(): AppError {
  return new AppError({
    code: "CONFLICT",
    message: "This entry changed on another device.",
  });
}

function idOf(map: ReadonlyMap<string, string>, sourceId: string): string {
  return map.get(sourceId) ?? sourceId;
}

function toEntries(page: EntryPageRows): Entry[] {
  const linksOf = new Map<string, string[]>();
  for (const link of page.links) {
    linksOf.set(link.entryId, [
      ...(linksOf.get(link.entryId) ?? []),
      link.activityId,
    ]);
  }
  return page.entries.map((row) => {
    const activityIds = applySelections({
      saved: linksOf.get(row.id) ?? [],
      selections: page.selections.filter(
        (selection) => selection.logicalDate === row.logicalDate,
      ),
    });
    return toEntry({
      row,
      activityIds: [...activityIds],
      completedGoalIds: page.completions
        .filter((completion) => completion.logicalDate === row.logicalDate)
        .map((completion) => completion.goalId),
      moodId: row.effectiveMoodId,
    });
  });
}

export interface SelectionResult {
  completion?: GoalCompletion;
  selection?: DayActivitySelection;
  affectedGoalCompletions: GoalCompletion[];
  affectedActivitySelections: DayActivitySelection[];
}

/**
 * The days of the journal: the saved entries, the taps that wait for a save,
 * and the goal completions that follow the activities of a day.
 */
export class DaysLogic extends Logic<DaysProps, Record<string, never>> {
  constructor(deps: DaysProps) {
    super({ deps, initialState: {} });
  }

  /** One page of saved entries, newest first, and whether more follow. */
  async listEntries({
    limit,
    offset,
  }: {
    limit: number;
    offset: number;
  }): Promise<{ entries: Entry[]; hasMore: boolean; nextOffset: number }> {
    const page = await this.deps.storage.days.readEntryPage({
      limit: limit + 1,
      offset,
    });
    const entries = toEntries(page);
    return {
      entries: entries.slice(0, limit),
      hasMore: entries.length > limit,
      nextOffset: offset + Math.min(entries.length, limit),
    };
  }

  /** The saved entries from `startDate` to `endDate`, oldest first. */
  async listEntriesInRange({
    startDate,
    endDate,
  }: {
    startDate: string;
    endDate: string;
  }): Promise<Entry[]> {
    if (!isLogicalDate(startDate) || !isLogicalDate(endDate)) {
      throw invalid("Choose a valid date range.");
    }
    if (startDate > endDate) {
      throw invalid("The start date must not be after the end date.");
    }
    return toEntries(
      await this.deps.storage.days.readEntryRange({ startDate, endDate }),
    );
  }

  /** The first and the last day with an entry, and how many days have one. */
  historySpan() {
    return this.deps.storage.days.readHistorySpan();
  }

  /**
   * The days of a range on which a goal is complete, and the first day on
   * which it was ever complete, also outside the range.
   */
  async goalCompletionDates({
    goalId,
    startDate,
    endDate,
  }: {
    goalId: string;
    startDate: string;
    endDate: string;
  }): Promise<{ dates: string[]; firstDate: string | null }> {
    if (!isLogicalDate(startDate) || !isLogicalDate(endDate)) {
      throw invalid("Choose a valid history range.");
    }
    return this.deps.storage.days.readGoalCompletionDates({
      goalId,
      startDate,
      endDate,
    });
  }

  /** The date on this server, which counts days in UTC. */
  today(): string {
    return this.timestamp().slice(0, 10);
  }

  /** The days of a `YYYY-MM` month that have an entry, with their moods. */
  async listCalendar({
    month,
  }: {
    month: string;
  }): Promise<CalendarEntryDay[]> {
    if (!isMonth(month)) {
      throw invalid("Choose a valid month.");
    }
    return this.deps.storage.days.listCalendarDays(monthDateRange(month));
  }

  /**
   * The saved days from `startDate` to `endDate` (the whole journal when a
   * bound is missing), oldest first, each with the mood and the activities
   * that the owner sees: the taps that wait for a save count.
   */
  async listEffectiveDays({
    startDate = EARLIEST_DATE,
    endDate = LATEST_DATE,
  }: {
    startDate?: string | undefined;
    endDate?: string | undefined;
  }): Promise<EffectiveDay[]> {
    if (!isLogicalDate(startDate) || !isLogicalDate(endDate)) {
      throw invalid("Choose a valid date.");
    }
    const rows = await this.deps.storage.days.readEffectiveDayRows({
      startDate,
      endDate,
    });
    const linksOf = new Map<string, string[]>();
    for (const link of rows.links) {
      linksOf.set(link.entryId, [
        ...(linksOf.get(link.entryId) ?? []),
        link.activityId,
      ]);
    }
    const selectionsOf = new Map<string, ActivitySelectionRow[]>();
    for (const selection of rows.selections) {
      selectionsOf.set(selection.logicalDate, [
        ...(selectionsOf.get(selection.logicalDate) ?? []),
        selection,
      ]);
    }
    return rows.entries.map((row) => ({
      logicalDate: row.logicalDate,
      moodId: row.effectiveMoodId,
      activityIds: [
        ...applySelections({
          saved: linksOf.get(row.id) ?? [],
          selections: selectionsOf.get(row.logicalDate) ?? [],
        }),
      ],
    }));
  }

  /** The day as the owner sees it. The entry is `null` for a day without one. */
  async readDay({ logicalDate }: { logicalDate: string }): Promise<DayState> {
    if (!isLogicalDate(logicalDate)) {
      throw invalid("Choose a valid date.");
    }
    return toDayState({
      logicalDate,
      rows: await this.deps.storage.days.readDayRows({ logicalDate }),
    });
  }

  /** Save the entry of a day with the mood and the activities in `input`. */
  async saveEntry({
    logicalDate,
    input,
  }: {
    logicalDate: string;
    input: EntryInput;
  }): Promise<Entry> {
    this.requireStartedDate(logicalDate);
    await this.writeEntry({ logicalDate, input, before: () => [] });
    return this.readSavedEntry({ logicalDate });
  }

  /**
   * Save a whole day in one batch: the mood, exactly these activities, and the
   * goal completions that go with them. The taps that waited are dropped.
   */
  async saveDay({
    logicalDate,
    input,
  }: {
    logicalDate: string;
    input: DayInput;
  }): Promise<Entry> {
    this.requireStartedDate(logicalDate);
    const { storage } = this.deps;
    const plan = planDaySave({
      goals: await storage.days.listGoalLinks(),
      activityIds: input.activityIds,
      completedGoalIds: input.completedGoalIds,
    });
    const timestamp = this.timestamp();
    await this.writeEntry({
      logicalDate,
      input: {
        moodId: input.moodId,
        activityIds: plan.activityIds,
        completedGoalIds: [],
        expectedVersion: input.expectedVersion,
      },
      before: (planning) => [
        ...planning.days.planClearSelections({ logicalDate }),
        planning.days.planDeleteCompletions({
          logicalDate,
          goalIds: plan.clearGoalIds,
        }),
        planning.days.planInsertCompletions({
          logicalDate,
          goalIds: plan.completeGoalIds,
          timestamp,
        }),
      ],
    });
    return this.readSavedEntry({ logicalDate });
  }

  /** Delete the entry of a day. A day without an entry is a success. */
  async deleteEntry({
    logicalDate,
    expectedVersion,
  }: {
    logicalDate: string;
    expectedVersion?: number | undefined;
  }): Promise<void> {
    if (!isLogicalDate(logicalDate)) {
      throw invalid("Choose a valid date.");
    }
    const existing = await this.deps.storage.days.findEntryRow({ logicalDate });
    if (!existing || existing.deletedAt) {
      return;
    }
    if (expectedVersion !== undefined && existing.version !== expectedVersion) {
      throw versionConflict();
    }
    const timestamp = this.timestamp();
    const [deletion] = await this.deps.atomic((planning) => [
      planning.days.planDeleteEntry({
        logicalDate,
        version: existing.version,
        timestamp,
      }),
    ]);
    if (deletion.changes === 0) {
      throw versionConflict();
    }
  }

  /** The owner taps a mood. It stays until the day is saved. */
  async setMood({
    logicalDate,
    moodId,
  }: {
    logicalDate: string;
    moodId: string;
  }): Promise<{ logicalDate: string; moodId: string }> {
    this.requireStartedDate(logicalDate);
    if (!(await this.deps.storage.days.moodExists({ id: moodId }))) {
      throw invalid("Choose one of the five moods.");
    }
    const timestamp = this.timestamp();
    await this.deps.atomic((planning) => [
      planning.days.planUpsertMoodSelection({ logicalDate, moodId, timestamp }),
    ]);
    return { logicalDate, moodId };
  }

  /**
   * The owner taps an activity on or off. The goals of the activity follow it
   * on that day.
   */
  async setActivity({
    logicalDate,
    activityId,
    selected,
  }: {
    logicalDate: string;
    activityId: string;
    selected: boolean;
  }): Promise<SelectionResult> {
    this.requireStartedDate(logicalDate);
    const { storage } = this.deps;
    const [exists, goalIds, entry] = await Promise.all([
      storage.days.activityExists({ id: activityId }),
      storage.days.listGoalIdsOfActivity({ activityId }),
      storage.days.findEntryRow({ logicalDate }),
    ]);
    if (!exists) {
      throw invalid("One activity is no longer available.");
    }
    const entryId = entry && !entry.deletedAt ? entry.id : null;
    const timestamp = this.timestamp();
    await this.deps.atomic((planning) => [
      planning.days.planUpsertActivitySelection({
        logicalDate,
        activityId,
        selected,
        timestamp,
      }),
      ...goalIds.map((goalId) =>
        selected
          ? planning.days.planUpsertCompletion({
              goalId,
              logicalDate,
              entryId,
              timestamp,
            })
          : planning.days.planDeleteCompletion({ goalId, logicalDate }),
      ),
    ]);
    const selection = { logicalDate, activityId, selected };
    return {
      selection,
      affectedGoalCompletions: goalIds.map((goalId) => ({
        goalId,
        logicalDate,
        completed: selected,
        ...(entryId === null ? {} : { entryId }),
      })),
      affectedActivitySelections: [selection],
    };
  }

  /**
   * The statements that write the days of a backup. A day that the owner
   * recorded, or that another source imported, stays: the import is refused.
   */
  async planImport({
    backup,
    ids,
  }: {
    backup: DaylioBackup;
    ids: ImportIds;
  }): Promise<PlannedStatement<never>[]> {
    const { storage } = this.deps;
    const entryIdOfDate = new Map(
      backup.entries.map((entry) => [
        entry.logicalDate,
        `daylio-entry-${entry.sourceId}`,
      ]),
    );
    const existing = await storage.days.listEntryIdsOfDates({
      dates: [...entryIdOfDate.keys()],
    });
    if (existing.some((row) => row.id !== entryIdOfDate.get(row.logicalDate))) {
      throw invalid("Import would replace an entry from a different source.");
    }
    return [
      ...storage.days.planImportEntries({
        importedAt: this.timestamp(),
        entries: backup.entries.map((entry) => ({
          id: `daylio-entry-${entry.sourceId}`,
          logicalDate: entry.logicalDate,
          localTime: entry.localTime,
          timezoneOffsetMinutes: entry.timezoneOffsetMinutes ?? null,
          moodId: idOf(ids.moods, entry.moodSourceId),
          legacyNoteTitle: entry.legacyNoteTitle ?? null,
          legacyNote: entry.legacyNote ?? null,
          sourceId: entry.sourceId,
          activityIds: entry.activitySourceIds.map((sourceId) =>
            idOf(ids.activities, sourceId),
          ),
        })),
      }),
      ...storage.days.planImportCompletions({
        completions: backup.completions.map((completion) => ({
          id: `daylio-completion-${completion.sourceId}`,
          goalId: idOf(ids.goals, completion.goalSourceId),
          logicalDate: completion.logicalDate,
          localTime: completion.localTime ?? null,
          entryId: entryIdOfDate.get(completion.logicalDate) ?? null,
          sourceId: completion.sourceId,
        })),
      }),
    ];
  }

  /** Every row of the tables of the days, for the export file. */
  exportRows() {
    return this.deps.storage.days.listAllForExport();
  }

  private timestamp(): string {
    return new Date(this.deps.services.clock.now()).toISOString();
  }

  private requireStartedDate(logicalDate: string): void {
    if (!isLogicalDate(logicalDate)) {
      throw invalid("Choose a valid date.");
    }
    if (logicalDate > latestStartedDate(this.deps.services.clock.now())) {
      throw invalid(
        "That day has not started yet. Choose today or an earlier day.",
      );
    }
  }

  private async readSavedEntry({
    logicalDate,
  }: {
    logicalDate: string;
  }): Promise<Entry> {
    const { entry } = await this.readDay({ logicalDate });
    if (!entry) {
      throw new AppError({
        code: "INTERNAL",
        message: "The saved entry is missing.",
      });
    }
    return entry;
  }

  /**
   * Check the references, then write the entry in one batch, after the
   * statements of `before`. A save with a stale version changes nothing.
   */
  private async writeEntry({
    logicalDate,
    input,
    before,
  }: {
    logicalDate: string;
    input: EntryInput;
    before: (planning: PlanningStorage) => readonly PlannedStatement<unknown>[];
  }): Promise<void> {
    const { storage, atomic } = this.deps;
    const [persisted] = await Promise.all([
      storage.days.findEntryRow({ logicalDate }),
      this.requireKnownReferences(input),
    ]);
    const existing = persisted && !persisted.deletedAt ? persisted : undefined;
    if (
      input.expectedVersion !== undefined &&
      (existing?.version ?? 0) !== input.expectedVersion
    ) {
      throw versionConflict();
    }
    const timestamp = this.timestamp();
    const entryId = persisted?.id ?? `entry-${crypto.randomUUID()}`;
    const write: EntryWrite = {
      id: entryId,
      logicalDate,
      localTime: input.localTime ?? existing?.localTime ?? DEFAULT_LOCAL_TIME,
      timezone: input.timezone ?? existing?.timezone ?? "",
      timezoneOffsetMinutes:
        input.timezoneOffsetMinutes ?? existing?.timezoneOffsetMinutes ?? null,
      moodId: input.moodId,
      legacyNoteTitle:
        input.legacyNoteTitle ?? existing?.legacyNoteTitle ?? null,
      legacyNote: input.legacyNote ?? existing?.legacyNote ?? null,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      replaces: {
        version: persisted?.version ?? 0,
        deletedAt: persisted?.deletedAt ?? null,
      },
    };
    try {
      await atomic((planning) => [
        ...before(planning),
        planning.days.planUpsertEntry(write),
        planning.days.planDeleteEntryActivities({ entryId }),
        planning.days.planInsertEntryActivities({
          entryId,
          logicalDate,
          activityIds: input.activityIds,
        }),
        planning.days.planLinkCompletionsToEntry({
          logicalDate,
          entryId,
          timestamp,
        }),
        ...planning.days.planClearSelections({ logicalDate }),
      ]);
    } catch (error) {
      if (storage.days.isVersionConflict(error)) {
        throw versionConflict();
      }
      throw error;
    }
  }

  private async requireKnownReferences(input: EntryInput): Promise<void> {
    const { storage } = this.deps;
    const [moodExists, activityIds, goalIds] = await Promise.all([
      storage.days.moodExists({ id: input.moodId }),
      storage.days.findActivityIds({ ids: input.activityIds }),
      storage.days.findGoalIds({ ids: input.completedGoalIds }),
    ]);
    if (!moodExists) {
      throw invalid("Choose one of the five moods.");
    }
    if (input.activityIds.some((id) => !activityIds.has(id))) {
      throw invalid("One activity is no longer available.");
    }
    if (input.completedGoalIds.some((id) => !goalIds.has(id))) {
      throw invalid("One goal is no longer available.");
    }
  }
}
