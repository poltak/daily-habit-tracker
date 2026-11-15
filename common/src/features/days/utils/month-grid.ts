import {
  addDays,
  dayOfWeek,
  monthDateRange,
  weekStartsOn,
} from "../../core/utils/logical-date.js";

/**
 * The cells of a calendar month, one row for each week. A `null` cell pads the
 * first week, so the first day of the month falls under its weekday.
 */
export function monthCells({
  month,
  weekEndsOn,
}: {
  month: string;
  weekEndsOn: number;
}): (string | null)[] {
  const { startDate, endDate } = monthDateRange(month);
  const blanks = (dayOfWeek(startDate) - weekStartsOn(weekEndsOn) + 7) % 7;
  const cells: (string | null)[] = Array.from({ length: blanks }, () => null);
  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    cells.push(date);
  }
  return cells;
}
