import type { DaySelections, Entry } from "./daylio.ts";
import type { Draft } from "./draft-storage.ts";

export type DayRefreshState = {
  entry: Entry | null;
  completedGoalIds?: string[];
  daySelections?: DaySelections;
};

export function draftFromDayRefreshState({
  entry,
  completedGoalIds = entry?.completedGoalIds ?? [],
  daySelections,
}: DayRefreshState): Draft {
  const draft: Draft = entry
    ? {
        moodId: entry.moodId,
        activityIds: [...entry.activityIds],
        completedGoalIds: [...entry.completedGoalIds],
        localTime: entry.localTime,
        version: entry.version,
      }
    : {
        moodId: "",
        activityIds: [],
        completedGoalIds: [],
        localTime: "23:00",
      };

  if (daySelections) {
    draft.moodId = daySelections.moodId ?? draft.moodId;
    draft.activityIds = [...daySelections.activityIds];
  }
  draft.completedGoalIds = [...new Set(completedGoalIds)];
  return draft;
}
