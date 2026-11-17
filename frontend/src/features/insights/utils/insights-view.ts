import type {
  Activity,
  ActivityGroup,
  Mood,
} from "@app/common/features/catalog/types";
import { addDays } from "@app/common/features/core/utils/logical-date";
import { daysInInsightsRange } from "@app/common/features/insights/utils/date-range";
import { summarizeMood } from "@app/common/features/insights/utils/summarize-mood";
import { buildMonthGrid, type MonthRow } from "./month-grid.js";
import { buildMoodLinks, type MoodLinks } from "./mood-links.js";
import type { InsightsPeriod } from "./period.js";
import { buildRecentChange, type RecentChange } from "./recent-change.js";
import { buildWeekdayShares, type WeekdayShare } from "./weekday-share.js";

const MIN_PREVIOUS_DAYS = 10;

export interface SummaryView {
  recordedDays: number;
  /** The share of good days from 0 to 1. Null without a day with a known mood. */
  goodShare: number | null;
  meanMood: number | null;
  /** Null when there is no period before to compare with. */
  change: { points: number; against: string } | null;
}

export interface InsightsView {
  summary: SummaryView;
  months: MonthRow[];
  moodLinks: MoodLinks;
  recent: RecentChange;
  weekdays: WeekdayShare[];
}

/** The text after "vs" for the period before, or null for all time. */
function previousPeriodLabel({
  preset,
  length,
}: {
  preset: string;
  length: number;
}): string | null {
  if (/^\d{4}$/.test(preset)) {
    return String(Number(preset) - 1);
  }
  return ["90d", "1y", "custom"].includes(preset)
    ? `the ${length} days before`
    : null;
}

export function buildInsightsView({
  period,
  preset,
  moods,
  activities,
  groups,
  weekEndsOn,
}: {
  period: InsightsPeriod;
  preset: string;
  moods: readonly Mood[];
  activities: readonly Activity[];
  groups: readonly ActivityGroup[];
  weekEndsOn: number;
}): InsightsView {
  const { days, range } = period;
  const mood = summarizeMood(days, moods);
  const length = daysInInsightsRange(range.startDate, range.endDate);
  const against = previousPeriodLabel({ preset, length });
  // A year in progress compares with the whole year before, as its label says.
  const previousYear = /^\d{4}$/.test(preset) ? Number(preset) - 1 : null;
  const previousStart =
    previousYear === null
      ? addDays(range.startDate, -length)
      : `${previousYear}-01-01`;
  const previousEnd = addDays(range.startDate, -1);
  const previousDays = period.history.filter(
    (day) => day.logicalDate >= previousStart && day.logicalDate <= previousEnd,
  );
  const previousShare = summarizeMood(previousDays, moods).goodRate;
  const change =
    against !== null &&
    mood.goodRate !== null &&
    previousShare !== null &&
    previousDays.length >= MIN_PREVIOUS_DAYS
      ? {
          points: Math.round((mood.goodRate - previousShare) * 100),
          against,
        }
      : null;
  return {
    summary: {
      recordedDays: days.length,
      goodShare: mood.goodRate,
      meanMood: mood.mean,
      change,
    },
    months: buildMonthGrid({ days, moods }),
    moodLinks: buildMoodLinks({ days, moods, activities, groups }),
    recent: buildRecentChange({
      days,
      moods,
      activities,
      groups,
      endDate: range.endDate,
    }),
    weekdays: buildWeekdayShares({ days, moods, weekEndsOn }),
  };
}
