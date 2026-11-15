import type {
  DaySelections,
  DayState,
  Entry,
} from "@app/common/features/days/types";

/** The choices for one day on this device, before and after the day is saved. */
export interface Draft {
  moodId: string;
  activityIds: string[];
  completedGoalIds: string[];
  localTime: string;
  /** The version of the saved entry. A draft without one is for a new entry. */
  version?: number;
}

/** The time of an entry when the owner picks none. */
const DEFAULT_LOCAL_TIME = "23:00";

export function emptyDraft(): Draft {
  return {
    moodId: "",
    activityIds: [],
    completedGoalIds: [],
    localTime: DEFAULT_LOCAL_TIME,
  };
}

export function draftFromEntry(entry: Entry | null): Draft {
  if (!entry) {
    return emptyDraft();
  }
  return {
    moodId: entry.moodId,
    activityIds: [...entry.activityIds],
    completedGoalIds: [...entry.completedGoalIds],
    localTime: entry.localTime,
    version: entry.version,
  };
}

/** The body of a save. Version 0 means that no entry exists yet. */
export function entryInputFromDraft({ version, ...draft }: Draft) {
  return { ...draft, expectedVersion: version ?? 0 };
}

/** The draft that a refresh of the day gives: the saved entry with the taps applied. */
export function draftFromDayState({
  entry,
  completedGoalIds,
  daySelections,
}: DayState): Draft {
  const draft = draftFromEntry(entry);
  draft.moodId = daySelections.moodId ?? draft.moodId;
  draft.activityIds = [...daySelections.activityIds];
  draft.completedGoalIds = [...new Set(completedGoalIds)];
  return draft;
}

export function sameDraft(left: Draft, right: Draft): boolean {
  return (
    left.moodId === right.moodId &&
    left.localTime === right.localTime &&
    left.version === right.version &&
    sameList(left.activityIds, right.activityIds) &&
    sameList(left.completedGoalIds, right.completedGoalIds)
  );
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

/** True when the draft has the mood and the activities that the entry has. */
export function draftMatchesEntry(draft: Draft, entry: Entry): boolean {
  return (
    draft.moodId === entry.moodId &&
    draft.activityIds.length === entry.activityIds.length &&
    draft.activityIds.every((id) => entry.activityIds.includes(id))
  );
}

/**
 * The draft for a day that opens: the draft from this device when there is
 * one, with the choices that the owner made on another device put on top.
 */
export function draftForOpenedDay({
  state,
  recovered,
}: {
  state: DayState;
  recovered: Draft | null;
}): { draft: Draft; restored: boolean } {
  const { entry, daySelections } = state;
  const completedGoalIds = [...new Set(state.completedGoalIds)];
  if (!recovered) {
    const base = entry
      ? draftFromEntry(entry)
      : {
          ...emptyDraft(),
          moodId: daySelections.moodId ?? "",
          activityIds: [...daySelections.activityIds],
        };
    return { draft: { ...base, completedGoalIds }, restored: false };
  }
  const draft = { ...recovered, completedGoalIds };
  draft.moodId = moodOfRecovered({ recovered, entry, daySelections });
  draft.activityIds = activitiesOfRecovered({ recovered, daySelections });
  return { draft, restored: true };
}

function moodOfRecovered({
  recovered,
  entry,
  daySelections,
}: {
  recovered: Draft;
  entry: Entry | null;
  daySelections: DaySelections;
}): string {
  return daySelections.moodOverride
    ? (daySelections.moodId ?? entry?.moodId ?? "")
    : recovered.moodId;
}

function activitiesOfRecovered({
  recovered,
  daySelections,
}: {
  recovered: Draft;
  daySelections: DaySelections;
}): string[] {
  const activityIds = new Set(recovered.activityIds);
  for (const activityId of daySelections.activityOverrideIds) {
    if (daySelections.activityIds.includes(activityId)) {
      activityIds.add(activityId);
    } else {
      activityIds.delete(activityId);
    }
  }
  return daySelections.activityOverrideIds.length > 0
    ? [...activityIds]
    : recovered.activityIds;
}

/** `ids` with each toggle applied: `true` adds the ID and `false` removes it. */
export function applyToggles(
  ids: readonly string[],
  toggles: Iterable<readonly [string, boolean]>,
): string[] {
  const next = new Set(ids);
  for (const [id, on] of toggles) {
    if (on) {
      next.add(id);
    } else {
      next.delete(id);
    }
  }
  return [...next];
}

/** The draft or the entry without the activities and goals that the catalog no longer has. */
export function withKnownCatalog<
  Record extends { activityIds: string[]; completedGoalIds: string[] },
>({
  record,
  activityIds,
  goalIds,
}: {
  record: Record;
  activityIds: ReadonlySet<string>;
  goalIds: ReadonlySet<string>;
}): Record {
  const knownActivities = record.activityIds.filter((id) =>
    activityIds.has(id),
  );
  const knownGoals = record.completedGoalIds.filter((id) => goalIds.has(id));
  return knownActivities.length === record.activityIds.length &&
    knownGoals.length === record.completedGoalIds.length
    ? record
    : { ...record, activityIds: knownActivities, completedGoalIds: knownGoals };
}
