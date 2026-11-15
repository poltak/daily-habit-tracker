import type { Mood } from "../../catalog/types.js";
import { dayOfWeek } from "../../core/utils/logical-date.js";
import type { InsightsDay } from "../types.js";
import {
  EARLIEST_DATE,
  LATEST_DATE,
  uniqueDaysInRange,
  yearAndMonth,
} from "./rhythm-days.js";
import type {
  RhythmActivityFrequency,
  RhythmAnalysis,
  RhythmAnalysisInput,
  RhythmBucket,
  RhythmYear,
} from "./rhythm-types.js";
import { summarizeMood } from "./summarize-mood.js";

/** Monday-first labels used by the rhythm charts. */
const WEEKDAY_LABELS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Index of the weekday in a week that starts on Monday. */
function mondayFirstIndex(date: string): number {
  const sundayFirst = dayOfWeek(date);
  return sundayFirst === 0 ? 6 : sundayFirst - 1;
}

function makeActivityFrequency(
  days: readonly InsightsDay[],
  activityId: string | null | undefined,
): RhythmActivityFrequency | null {
  if (!activityId) {
    return null;
  }
  const loggedDays = days.length;
  const activityDays = days.filter((day) =>
    day.activityIds.includes(activityId),
  ).length;
  return {
    activityDays,
    loggedDays,
    fraction: loggedDays === 0 ? null : activityDays / loggedDays,
  };
}

function bucketFor({
  key,
  label,
  year,
  days,
  moods,
  activityId,
}: {
  key: string;
  label: string;
  year?: number;
  days: readonly InsightsDay[];
  moods: readonly Mood[];
  activityId: string | null | undefined;
}): RhythmBucket {
  const summary = summarizeMood(days, moods);
  return {
    key,
    label,
    ...(year === undefined ? {} : { year }),
    loggedCount: days.length,
    count: summary.count,
    mean: summary.mean,
    goodRate: summary.goodRate,
    distribution: summary.distribution,
    activityFrequency: makeActivityFrequency(days, activityId),
  };
}

function bucketsForDays({
  days,
  moods,
  activityId,
  year,
}: {
  days: readonly InsightsDay[];
  moods: readonly Mood[];
  activityId: string | null | undefined;
  year?: number;
}): { weekdays: RhythmBucket[]; months: RhythmBucket[] } {
  return {
    weekdays: WEEKDAY_KEYS.map((key, index) =>
      bucketFor({
        key,
        label: WEEKDAY_LABELS[index] ?? key,
        ...(year === undefined ? {} : { year }),
        days: days.filter((day) => mondayFirstIndex(day.logicalDate) === index),
        moods,
        activityId,
      }),
    ),
    months: MONTH_LABELS.map((label, index) =>
      bucketFor({
        key: String(index + 1).padStart(2, "0"),
        label,
        ...(year === undefined ? {} : { year }),
        days: days.filter(
          (day) => yearAndMonth(day.logicalDate)?.month === index + 1,
        ),
        moods,
        activityId,
      }),
    ),
  };
}

function yearSummary({
  days,
  moods,
  year,
  activityId,
}: {
  days: readonly InsightsDay[];
  moods: readonly Mood[];
  year: number;
  activityId: string | null | undefined;
}): RhythmYear {
  const yearDays = days.filter(
    (day) => yearAndMonth(day.logicalDate)?.year === year,
  );
  const summary = summarizeMood(yearDays, moods);
  return {
    year,
    loggedCount: yearDays.length,
    moodCount: summary.count,
    mean: summary.mean,
    goodRate: summary.goodRate,
    ...bucketsForDays({ days: yearDays, moods, activityId, year }),
  };
}

/**
 * Summarize weekday and month rhythms. Mood values are null when a bucket has
 * no known mood; activity frequency is an incidence fraction over logged days.
 */
export function summarizeRhythms(input: RhythmAnalysisInput): RhythmAnalysis {
  const startDate = yearAndMonth(input.startDate)
    ? input.startDate
    : EARLIEST_DATE;
  const endDate = yearAndMonth(input.endDate) ? input.endDate : LATEST_DATE;
  const allDays = uniqueDaysInRange(input.days, startDate, endDate);
  const requestedYear = input.year ?? null;
  const selectedDays =
    requestedYear === null
      ? allDays
      : allDays.filter(
          (day) => yearAndMonth(day.logicalDate)?.year === requestedYear,
        );
  const years = [
    ...new Set(
      allDays.flatMap((day) => yearAndMonth(day.logicalDate)?.year ?? []),
    ),
  ].toSorted((a, b) => a - b);
  const summary = summarizeMood(selectedDays, input.moods);
  return {
    selectedYear: requestedYear,
    yearOptions: years,
    loggedCount: selectedDays.length,
    moodCount: summary.count,
    ...bucketsForDays({
      days: selectedDays,
      moods: input.moods,
      activityId: input.activityId,
    }),
    years: years.map((year) =>
      yearSummary({
        days: allDays,
        moods: input.moods,
        year,
        activityId: input.activityId,
      }),
    ),
  };
}
