import type { Activity, Mood } from "@app/common/features/catalog/types";
import type { InsightsDay } from "@app/common/features/insights/types";
import { activityNameById } from "@app/common/features/insights/utils/activity-lists";
import { buildBestWeeksAnalysis } from "@app/common/features/insights/utils/best-weeks";
import { summarizeRhythms } from "@app/common/features/insights/utils/rhythm-buckets";
import type {
  BestWeeksAnalysis,
  RhythmAnalysis,
} from "@app/common/features/insights/utils/rhythm-types";

export interface RhythmChoices {
  /** A year, or an empty text for all years. */
  year: string;
  /** An activity ID, or an empty text for no overlay. */
  activityId: string;
}

export interface RhythmView {
  yearOptions: number[];
  /** The year in the filter, or an empty text for all years. */
  year: string;
  analysis: RhythmAnalysis;
  bestWeeks: BestWeeksAnalysis;
  overlayActivityName: string | null;
}

export function buildRhythmView({
  days,
  moods,
  activities,
  startDate,
  endDate,
  asOf,
  weekEndsOn,
  choices,
}: {
  days: readonly InsightsDay[];
  moods: readonly Mood[];
  activities: readonly Activity[];
  startDate: string;
  endDate: string;
  asOf: string;
  weekEndsOn: number;
  choices: RhythmChoices;
}): RhythmView {
  const available = summarizeRhythms({ days, moods, startDate, endDate });
  const year =
    choices.year !== "" && available.yearOptions.includes(Number(choices.year))
      ? choices.year
      : "";
  return {
    yearOptions: available.yearOptions,
    year,
    analysis: summarizeRhythms({
      days,
      moods,
      startDate,
      endDate,
      year: year === "" ? null : Number(year),
      activityId: choices.activityId || null,
    }),
    bestWeeks: buildBestWeeksAnalysis({
      days,
      moods,
      activities,
      startDate,
      endDate,
      asOf,
      weekEndsOn,
    }),
    overlayActivityName: choices.activityId
      ? (activityNameById(activities).get(choices.activityId) ??
        choices.activityId)
      : null,
  };
}
