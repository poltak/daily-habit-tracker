import type { Mood } from "@app/common/features/catalog/types";
import {
  dayOfWeek,
  WEEKDAY_NAMES,
  weekdayOrder,
} from "@app/common/features/core/utils/logical-date";
import type { InsightsDay } from "@app/common/features/insights/types";
import { summarizeMood } from "@app/common/features/insights/utils/summarize-mood";

export interface WeekdayShare {
  name: string;
  shortName: string;
  /** The share of good days from 0 to 1, or null without a day with a known mood. */
  share: number | null;
  /** The days with a known mood. */
  days: number;
  /** True for each weekday with the highest share. */
  best: boolean;
}

/** The seven weekdays in the order of a week that ends on `weekEndsOn`. */
export function buildWeekdayShares({
  days,
  moods,
  weekEndsOn,
}: {
  days: readonly InsightsDay[];
  moods: readonly Mood[];
  weekEndsOn: number;
}): WeekdayShare[] {
  const shares = weekdayOrder(weekEndsOn).map((weekday) => {
    const summary = summarizeMood(
      days.filter((day) => dayOfWeek(day.logicalDate) === weekday),
      moods,
    );
    const name = WEEKDAY_NAMES[weekday] ?? "";
    return {
      name,
      shortName: name.slice(0, 3),
      share: summary.goodRate,
      days: summary.count,
    };
  });
  const highest = Math.max(0, ...shares.map((item) => item.share ?? 0));
  return shares.map((item) => ({
    ...item,
    best: item.share !== null && highest > 0 && item.share === highest,
  }));
}
