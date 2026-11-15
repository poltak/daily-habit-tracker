import type { Activity, Mood } from "../../catalog/types.js";
import {
  addDays,
  dayOfWeek,
  isLogicalDate,
  weekStartsOn,
  WEEKDAY_NAMES,
} from "../../core/utils/logical-date.js";
import type { InsightsDay } from "../types.js";
import {
  EARLIEST_DATE,
  LATEST_DATE,
  uniqueDaysInRange,
} from "./rhythm-days.js";
import type {
  BestWeeksAnalysis,
  BestWeeksAnalysisInput,
  QualifyingWeek,
  WeekActivityComparison,
  WeekCohort,
  WeekCohortSummary,
} from "./rhythm-types.js";
import { summarizeMood } from "./summarize-mood.js";

const MINIMUM_LOGGED_DAYS = 4;
const DEFAULT_WEEK_ENDS_ON = 0;

/** "Monday–Sunday" for a week that ends on Sunday. */
function weekRangeLabel(weekEndsOn: number): string {
  return `${WEEKDAY_NAMES[weekStartsOn(weekEndsOn)]}–${WEEKDAY_NAMES[weekEndsOn]}`;
}

function weekStartOf(date: string, weekEndsOn: number): string {
  const daysIntoWeek = (dayOfWeek(date) - weekStartsOn(weekEndsOn) + 7) % 7;
  return addDays(date, -daysIntoWeek);
}

function makeWeek({
  weekStart,
  weekRange,
  days,
  moods,
  activities,
}: {
  weekStart: string;
  weekRange: string;
  days: readonly InsightsDay[];
  moods: readonly Mood[];
  activities: readonly Activity[];
}): QualifyingWeek {
  const weekEnd = addDays(weekStart, 6);
  const summary = summarizeMood(days, moods);
  const knownActivityIds = new Set(activities.map((activity) => activity.id));
  const activityDays: Record<string, number> = {};
  let totalActivitySelections = 0;
  for (const day of days) {
    for (const activityId of new Set(day.activityIds)) {
      if (!knownActivityIds.has(activityId)) {
        continue;
      }
      activityDays[activityId] = (activityDays[activityId] ?? 0) + 1;
      totalActivitySelections += 1;
    }
  }
  return {
    weekStart,
    weekEnd,
    label: `${weekStart}–${weekEnd} (${weekRange})`,
    loggedDays: days.length,
    moodCount: summary.count,
    moodMean: summary.mean,
    goodRate: summary.goodRate,
    activityDays,
    activityFrequency: Object.fromEntries(
      activities.map((activity) => [
        activity.id,
        days.length === 0
          ? null
          : (activityDays[activity.id] ?? 0) / days.length,
      ]),
    ),
    activitySpread:
      days.length === 0 ? null : totalActivitySelections / days.length,
    distinctActivityCount: Object.keys(activityDays).length,
    cohort: null,
  };
}

function meanOrNull(values: readonly (number | null)[]): number | null {
  const numbers = values.filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  return numbers.length === 0
    ? null
    : numbers.reduce((total, value) => total + value, 0) / numbers.length;
}

function classifyWeeks(weeks: QualifyingWeek[]): {
  higher: QualifyingWeek[];
  typical: QualifyingWeek[];
  unclassified: QualifyingWeek[];
  threshold: number | null;
} {
  const moodWeeks = weeks.filter((week) => week.moodMean !== null);
  const unclassified = weeks.filter((week) => week.moodMean === null);
  if (moodWeeks.length < 2) {
    return {
      higher: [],
      typical: [...moodWeeks],
      unclassified,
      threshold: null,
    };
  }
  const ordered = [...moodWeeks].toSorted((a, b) => {
    const moodOrder = (b.moodMean ?? -Infinity) - (a.moodMean ?? -Infinity);
    return moodOrder || a.weekStart.localeCompare(b.weekStart);
  });
  const distinctDescending = [...new Set(ordered.map((week) => week.moodMean))]
    .filter((value): value is number => value !== null)
    .toSorted((a, b) => b - a);
  if (distinctDescending.length < 2) {
    return {
      higher: [],
      typical: [...moodWeeks],
      unclassified,
      threshold: null,
    };
  }
  // Choose the upper half boundary, then keep every tie at that boundary in the
  // same cohort. This makes the split deterministic without picking a tied week.
  const boundaryIndex = Math.max(0, Math.ceil(ordered.length / 2) - 1);
  let threshold = ordered[boundaryIndex]?.moodMean ?? null;
  // When the boundary is the lowest distinct value, including all ties would
  // swallow the comparison cohort (for example [5, 3, 3, 3]). Move the
  // threshold to the next distinct value so the highest mood band remains
  // visible without selecting an arbitrary week from a tied group.
  if (
    threshold !== null &&
    threshold === distinctDescending[distinctDescending.length - 1]
  ) {
    threshold = distinctDescending[distinctDescending.length - 2] ?? threshold;
  }
  const higher = moodWeeks.filter(
    (week) =>
      week.moodMean !== null &&
      threshold !== null &&
      week.moodMean >= threshold,
  );
  const higherKeys = new Set(higher.map((week) => week.weekStart));
  const typical = moodWeeks.filter((week) => !higherKeys.has(week.weekStart));
  return { higher, typical, unclassified, threshold };
}

function cohortSummary(
  cohort: WeekCohort,
  weeks: readonly QualifyingWeek[],
): WeekCohortSummary {
  return {
    cohort,
    weekCount: weeks.length,
    moodMean: meanOrNull(weeks.map((week) => week.moodMean)),
    loggedDaysMean: meanOrNull(weeks.map((week) => week.loggedDays)),
    activitySpreadMean: meanOrNull(weeks.map((week) => week.activitySpread)),
  };
}

function compareActivities({
  activities,
  higherWeeks,
  typicalWeeks,
}: {
  activities: readonly Activity[];
  higherWeeks: readonly QualifyingWeek[];
  typicalWeeks: readonly QualifyingWeek[];
}): WeekActivityComparison[] {
  return [...activities]
    .toSorted(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    )
    .map((activity) => {
      const higherFrequency = meanOrNull(
        higherWeeks.map((week) => week.activityFrequency[activity.id] ?? null),
      );
      const typicalFrequency = meanOrNull(
        typicalWeeks.map((week) => week.activityFrequency[activity.id] ?? null),
      );
      return {
        activityId: activity.id,
        higherFrequency,
        typicalFrequency,
        difference:
          higherFrequency === null || typicalFrequency === null
            ? null
            : higherFrequency - typicalFrequency,
        higherActivityDays: higherWeeks.reduce(
          (total, week) => total + (week.activityDays[activity.id] ?? 0),
          0,
        ),
        typicalActivityDays: typicalWeeks.reduce(
          (total, week) => total + (week.activityDays[activity.id] ?? 0),
          0,
        ),
      };
    });
}

/**
 * Build ended, full week cohorts. Weeks end on `weekEndsOn`. A week needs at
 * least four distinct logged days by default. Higher weeks are the
 * deterministic upper half of mood-logged weeks, retaining ties at the
 * boundary; equal means yield one typical cohort and no invented "best" week.
 */
export function buildBestWeeksAnalysis(
  input: BestWeeksAnalysisInput,
): BestWeeksAnalysis {
  const minimumLoggedDays = Math.max(
    1,
    Math.floor(input.minimumLoggedDays ?? MINIMUM_LOGGED_DAYS),
  );
  const startDate = isLogicalDate(input.startDate)
    ? input.startDate
    : EARLIEST_DATE;
  const endDate = isLogicalDate(input.endDate) ? input.endDate : LATEST_DATE;
  const asOf = isLogicalDate(input.asOf) ? input.asOf : endDate;
  const weekEndsOn = input.weekEndsOn ?? DEFAULT_WEEK_ENDS_ON;
  const weekRange = weekRangeLabel(weekEndsOn);
  const byWeek = new Map<string, InsightsDay[]>();
  for (const day of uniqueDaysInRange(input.days, startDate, endDate)) {
    const weekStart = weekStartOf(day.logicalDate, weekEndsOn);
    byWeek.set(weekStart, [...(byWeek.get(weekStart) ?? []), day]);
  }
  const weeks = [...byWeek.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .filter(([weekStart]) => {
      const weekEnd = addDays(weekStart, 6);
      return weekStart >= startDate && weekEnd <= endDate && weekEnd < asOf;
    })
    .map(([weekStart, weekDays]) =>
      makeWeek({
        weekStart,
        weekRange,
        days: weekDays,
        moods: input.moods,
        activities: input.activities,
      }),
    )
    .filter((week) => week.loggedDays >= minimumLoggedDays);

  const classified = classifyWeeks(weeks);
  const higherWeeks = classified.higher.map((week) => ({
    ...week,
    cohort: "higher" as const,
  }));
  const typicalWeeks = classified.typical.map((week) => ({
    ...week,
    cohort: "typical" as const,
  }));
  const allWeeks = [
    ...higherWeeks,
    ...typicalWeeks,
    ...classified.unclassified,
  ].toSorted((a, b) => a.weekStart.localeCompare(b.weekStart));
  return {
    minimumLoggedDays,
    weekRange,
    qualifyingWeekCount: allWeeks.length,
    moodLoggedWeekCount: higherWeeks.length + typicalWeeks.length,
    weeks: allWeeks,
    higherWeeks,
    typicalWeeks,
    unclassifiedWeeks: classified.unclassified,
    higher: cohortSummary("higher", higherWeeks),
    typical: cohortSummary("typical", typicalWeeks),
    activityComparisons: compareActivities({
      activities: input.activities,
      higherWeeks,
      typicalWeeks,
    }),
    moodThreshold: classified.threshold,
    cohortMethod: `Qualifying weeks have at least four logged days, run ${weekRange}, fit wholly inside the selected range, and ended before the as-of date. Higher-mood weeks are the upper half of mood-logged weeks; ties stay together, and equal weekly means produce no separate higher cohort.`,
  };
}
