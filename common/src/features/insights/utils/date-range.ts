import { addDays } from "../../core/utils/logical-date.js";

/**
 * The first and the last day of a period. `preset` is `90d`, `1y`, a year
 * such as `2025`, or anything else for all time from `firstDate`.
 */
export function insightsDateRange({
  preset,
  asOf,
  firstDate,
}: {
  preset: string;
  asOf: string;
  firstDate: string;
}): { startDate: string; endDate: string } {
  if (preset === "90d" || preset === "1y") {
    return {
      startDate: addDays(asOf, preset === "90d" ? -89 : -364),
      endDate: asOf,
    };
  }
  if (/^\d{4}$/.test(preset)) {
    const yearEnd = `${preset}-12-31`;
    return {
      startDate: `${preset}-01-01`,
      endDate: yearEnd < asOf ? yearEnd : asOf,
    };
  }
  return { startDate: firstDate <= asOf ? firstDate : asOf, endDate: asOf };
}

const DAY_MS = 86_400_000;

/** The number of calendar days from `startDate` to `endDate`, both included. */
export function daysInInsightsRange(
  startDate: string,
  endDate: string,
): number {
  return Math.max(
    0,
    Math.round(
      (Date.parse(`${endDate}T00:00:00Z`) -
        Date.parse(`${startDate}T00:00:00Z`)) /
        DAY_MS,
    ) + 1,
  );
}
