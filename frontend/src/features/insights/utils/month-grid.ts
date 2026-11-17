import type { Mood } from "@app/common/features/catalog/types";
import type { InsightsDay } from "@app/common/features/insights/types";
import { summarizeMood } from "@app/common/features/insights/utils/summarize-mood";

export const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** 1 is under 60%, 2 is 60 to 69%, 3 is 70 to 79%, and 4 is 80% or more. */
type ShareBin = 1 | 2 | 3 | 4;

interface MonthCell {
  percent: number;
  bin: ShareBin;
  title: string;
}

export interface MonthRow {
  year: string;
  /** January to December. A month without a recorded day is null. */
  cells: (MonthCell | null)[];
}

function binOf(percent: number): ShareBin {
  if (percent >= 80) {
    return 4;
  }
  if (percent >= 70) {
    return 3;
  }
  return percent >= 60 ? 2 : 1;
}

/** One row for each year from the first day to the last. */
export function buildMonthGrid({
  days,
  moods,
}: {
  days: readonly InsightsDay[];
  moods: readonly Mood[];
}): MonthRow[] {
  const first = days[0];
  const last = days.at(-1);
  if (!first || !last) {
    return [];
  }
  const byMonth = new Map<string, InsightsDay[]>();
  for (const day of days) {
    const key = day.logicalDate.slice(0, 7);
    const month = byMonth.get(key);
    if (month) {
      month.push(day);
    } else {
      byMonth.set(key, [day]);
    }
  }
  const rows: MonthRow[] = [];
  for (
    let year = Number(first.logicalDate.slice(0, 4));
    year <= Number(last.logicalDate.slice(0, 4));
    year++
  ) {
    const cells = MONTH_NAMES.map((name, index): MonthCell | null => {
      const key = `${String(year).padStart(4, "0")}-${String(index + 1).padStart(2, "0")}`;
      const summary = summarizeMood(byMonth.get(key) ?? [], moods);
      if (summary.goodRate === null) {
        return null;
      }
      const percent = Math.round(summary.goodRate * 100);
      return {
        percent,
        bin: binOf(percent),
        title: `${name} ${year}: ${percent}% good days (${summary.count} ${summary.count === 1 ? "day" : "days"})`,
      };
    });
    rows.push({ year: String(year), cells });
  }
  return rows;
}
