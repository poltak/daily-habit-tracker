import { isLogicalDate } from "../../core/utils/logical-date.js";
import type { InsightsDay } from "../types.js";

/** The first and the last day that a range without valid dates stands for. */
export const EARLIEST_DATE = "1000-01-01";
export const LATEST_DATE = "9999-12-31";

/** The year and the month (1 to 12) of a valid `YYYY-MM-DD` date, or `null`. */
export function yearAndMonth(
  date: string,
): { year: number; month: number } | null {
  return isLogicalDate(date)
    ? { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) }
    : null;
}

/** The days inside the range, one for each date, oldest first. */
export function uniqueDaysInRange(
  days: readonly InsightsDay[],
  startDate: string,
  endDate: string,
): InsightsDay[] {
  const seen = new Map<string, InsightsDay>();
  for (const day of days) {
    if (
      !isLogicalDate(day.logicalDate) ||
      day.logicalDate < startDate ||
      day.logicalDate > endDate
    ) {
      continue;
    }
    // A day is a single observation. If a caller passes duplicates, merge
    // activity ids and keep the last non-empty mood so a duplicate cannot
    // inflate a sample.
    const previous = seen.get(day.logicalDate);
    if (!previous) {
      seen.set(day.logicalDate, {
        ...day,
        activityIds: [...new Set(day.activityIds)],
      });
      continue;
    }
    seen.set(day.logicalDate, {
      ...previous,
      ...day,
      moodId: day.moodId || previous.moodId,
      activityIds: [...new Set([...previous.activityIds, ...day.activityIds])],
    });
  }
  return [...seen.values()].toSorted((a, b) =>
    a.logicalDate.localeCompare(b.logicalDate),
  );
}
