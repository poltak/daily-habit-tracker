export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** The week runs Monday to Sunday, as it did in the old app. */
export const DEFAULT_WEEK_ENDS_ON = 0;

/** A weekday is 0 (Sunday) to 6 (Saturday). */
export function isWeekday(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 6
  );
}

/** The days of a week that ends on `weekEndsOn`, such as `Monday–Sunday`. */
export function weekRangeLabel(weekEndsOn: number): string {
  return `${WEEKDAY_NAMES[(weekEndsOn + 1) % 7]}–${WEEKDAY_NAMES[weekEndsOn]}`;
}
