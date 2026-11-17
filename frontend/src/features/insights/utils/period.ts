import { isLogicalDate } from "@app/common/features/core/utils/logical-date";
import type {
  InsightsData,
  InsightsDay,
} from "@app/common/features/insights/types";
import { insightsDateRange } from "@app/common/features/insights/utils/date-range";

export interface InsightsPeriod {
  /** The recorded days up to today, oldest first. */
  history: InsightsDay[];
  /** The years that have a recorded day, newest first. */
  years: string[];
  range: { startDate: string; endDate: string };
  /** False for a custom range that ends before it starts, or after today. */
  validRange: boolean;
  /** The recorded days in the range. */
  days: InsightsDay[];
  /** The analysis shows only for a valid range with at least one day. */
  showAnalysis: boolean;
}

/** The recorded days of the period that the owner picked. */
export function describePeriod({
  data,
  today,
  preset,
  customStart,
  customEnd,
}: {
  data: InsightsData | null;
  today: string;
  preset: string;
  customStart: string;
  customEnd: string;
}): InsightsPeriod {
  const history = (data?.days ?? [])
    .filter((day) => day.logicalDate <= today)
    .toSorted((a, b) => a.logicalDate.localeCompare(b.logicalDate));
  const range =
    preset === "custom"
      ? { startDate: customStart, endDate: customEnd }
      : insightsDateRange({
          preset,
          asOf: today,
          firstDate: history[0]?.logicalDate ?? today,
        });
  const validRange =
    isLogicalDate(range.startDate) &&
    isLogicalDate(range.endDate) &&
    range.startDate <= range.endDate &&
    range.endDate <= today;
  const days = validRange
    ? history.filter(
        (day) =>
          day.logicalDate >= range.startDate &&
          day.logicalDate <= range.endDate,
      )
    : [];
  return {
    history,
    years: [...new Set(history.map((day) => day.logicalDate.slice(0, 4)))]
      .toSorted()
      .toReversed(),
    range,
    validRange,
    days,
    showAnalysis: data !== null && validRange && days.length > 0,
  };
}
