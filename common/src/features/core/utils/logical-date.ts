/**
 * Calendar days for the journal. A logical date is a day written as
 * `YYYY-MM-DD`. The owner's device decides which day is today, so these rules
 * work on plain text dates and never on the zone of the machine they run on.
 */

const DAY_MS = 86_400_000;
// No time zone is more than 14 hours ahead of UTC.
const FURTHEST_ZONE_AHEAD_MS = 14 * 60 * 60 * 1000;

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

function partsOf(date: string): [number, number, number] {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  return [year, month, day];
}

function utcMillis(date: string): number {
  const [year, month, day] = partsOf(date);
  const value = new Date(0);
  value.setUTCFullYear(year, month - 1, day);
  return value.getTime();
}

function dateOfMillis(millis: number): string {
  const value = new Date(millis);
  return `${pad(value.getUTCFullYear(), 4)}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}

/** True for a real calendar day written as `YYYY-MM-DD`. */
export function isLogicalDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    dateOfMillis(utcMillis(value)) === value
  );
}

export function addDays(date: string, amount: number): string {
  return dateOfMillis(utcMillis(date) + amount * DAY_MS);
}

/** The day that a clock in `timeZone` shows at `now`. */
export function logicalDateInTimeZone({
  now,
  timeZone,
}: {
  now: number;
  timeZone: string;
}): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
}

/**
 * The latest day that has started somewhere in the world. The server does not
 * know the zone of the owner, so this is the last day it accepts a record for.
 */
export function latestStartedDate(now: number): string {
  return new Date(now + FURTHEST_ZONE_AHEAD_MS).toISOString().slice(0, 10);
}

export function dayOfWeek(date: string): number {
  return new Date(utcMillis(date)).getUTCDay();
}

export function isMonth(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}$/.test(value) &&
    isLogicalDate(`${value}-01`)
  );
}

/** The first and the last day of a `YYYY-MM` month. */
export function monthDateRange(month: string): {
  startDate: string;
  endDate: string;
} {
  const startDate = `${month}-01`;
  return { startDate, endDate: addDays(shiftMonth({ month, amount: 1 }), -1) };
}

/** The month `amount` months after `month`, as `YYYY-MM`. */
export function shiftMonth({
  month,
  amount,
}: {
  month: string;
  amount: number;
}): string {
  const [year, monthNumber] = partsOf(`${month}-01`);
  const index = year * 12 + (monthNumber - 1) + amount;
  return `${pad(Math.floor(index / 12), 4)}-${pad((index % 12) + 1)}`;
}

/** The weekday (0 is Sunday) on which a week starts, when it ends on `weekEndsOn`. */
export function weekStartsOn(weekEndsOn: number): number {
  return (weekEndsOn + 1) % 7;
}

/** The weekdays in display order for a week that ends on `weekEndsOn`. */
export function weekdayOrder(weekEndsOn: number): number[] {
  return Array.from(
    { length: 7 },
    (_, index) => (weekStartsOn(weekEndsOn) + index) % 7,
  );
}

type DateStyle = "friendly" | "long" | "short";

const DATE_FORMATS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  friendly: {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  },
  long: { month: "long", day: "numeric" },
  short: { month: "short", day: "numeric" },
};

/** `friendly`: "Monday, November 9, 2026". `long`: "November 9". `short`: "Nov 9". */
export function formatLogicalDate({
  date,
  style,
}: {
  date: string;
  style: DateStyle;
}): string {
  return new Intl.DateTimeFormat("en", {
    ...DATE_FORMATS[style],
    timeZone: "UTC",
  }).format(new Date(utcMillis(date) + DAY_MS / 2));
}

/** "November 2026". */
export function formatMonth(month: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(utcMillis(`${month}-01`) + DAY_MS / 2));
}
