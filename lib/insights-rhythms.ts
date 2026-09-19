import type { Activity, ActivityGroup, Mood } from "./daylio.ts";
import type { InsightsDay } from "./insights.ts";
import { summarizeMood } from "./insights.ts";

/** Monday-first labels used by the rhythm charts. */
export const RHYTHM_WEEKDAY_LABELS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export const RHYTHM_MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export type RhythmActivityFrequency = {
  activityDays: number;
  loggedDays: number;
  fraction: number | null;
};

export type RhythmBucket = {
  /** A stable machine-readable key: `mon`…`sun` or `01`…`12`. */
  key: string;
  label: string;
  year?: number;
  /** Number of distinct logged days in the bucket. */
  loggedCount: number;
  /** Number of logged days with a known mood. */
  count: number;
  mean: number | null;
  goodRate: number | null;
  distribution: Array<{ moodId: string; count: number }>;
  /** Selected activity incidence among logged days, never a raw count. */
  activityFrequency: RhythmActivityFrequency | null;
};

export type RhythmYear = {
  year: number;
  loggedCount: number;
  moodCount: number;
  mean: number | null;
  goodRate: number | null;
  weekdays: RhythmBucket[];
  months: RhythmBucket[];
};

export type RhythmAnalysis = {
  selectedYear: number | null;
  yearOptions: number[];
  loggedCount: number;
  moodCount: number;
  weekdays: RhythmBucket[];
  months: RhythmBucket[];
  years: RhythmYear[];
};

export type RhythmAnalysisInput = {
  days: readonly InsightsDay[];
  moods: readonly Mood[];
  startDate: string;
  endDate: string;
  /** `null` or `undefined` means all years. */
  year?: number | null;
  /** When omitted, the charts show only mood summaries. */
  activityId?: string | null;
};

export type WeekCohort = "higher" | "typical";

export type QualifyingWeek = {
  weekStart: string;
  weekEnd: string;
  /** Monday-Sunday label kept in the data for accessible consumers. */
  label: string;
  loggedDays: number;
  moodCount: number;
  moodMean: number | null;
  goodRate: number | null;
  activityDays: Record<string, number>;
  activityFrequency: Record<string, number | null>;
  /** Mean number of distinct activities recorded per logged day. */
  activitySpread: number | null;
  distinctActivityCount: number;
  cohort: WeekCohort | null;
};

export type WeekCohortSummary = {
  cohort: WeekCohort;
  weekCount: number;
  moodMean: number | null;
  loggedDaysMean: number | null;
  activitySpreadMean: number | null;
};

export type WeekActivityComparison = {
  activityId: string;
  higherFrequency: number | null;
  typicalFrequency: number | null;
  difference: number | null;
  higherActivityDays: number;
  typicalActivityDays: number;
};

export type BestWeeksAnalysis = {
  minimumLoggedDays: number;
  qualifyingWeekCount: number;
  moodLoggedWeekCount: number;
  weeks: QualifyingWeek[];
  higherWeeks: QualifyingWeek[];
  typicalWeeks: QualifyingWeek[];
  unclassifiedWeeks: QualifyingWeek[];
  higher: WeekCohortSummary;
  typical: WeekCohortSummary;
  activityComparisons: WeekActivityComparison[];
  moodThreshold: number | null;
  cohortMethod: string;
};

export type BestWeeksAnalysisInput = {
  days: readonly InsightsDay[];
  moods: readonly Mood[];
  activities: readonly Activity[];
  groups?: readonly ActivityGroup[];
  startDate: string;
  endDate: string;
  asOf: string;
  /** Four logged days keeps a week informative while allowing some gaps. */
  minimumLoggedDays?: number;
};

type DateParts = { year: number; month: number; day: number };

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const MINIMUM_LOGGED_DAYS = 4;

function parseDate(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return timestamp;
}

function partsFor(value: string): DateParts | null {
  const timestamp = parseDate(value);
  if (timestamp === null) return null;
  const date = new Date(timestamp);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function dateFromTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function addDays(value: string, amount: number): string | null {
  const timestamp = parseDate(value);
  return timestamp === null ? null : dateFromTimestamp(timestamp + amount * DAY_MS);
}

function compareDates(a: string, b: string): number {
  const aTimestamp = parseDate(a);
  const bTimestamp = parseDate(b);
  if (aTimestamp === null && bTimestamp === null) return 0;
  if (aTimestamp === null) return 1;
  if (bTimestamp === null) return -1;
  return aTimestamp - bTimestamp;
}

function inDateRange(value: string, startDate: string, endDate: string): boolean {
  return parseDate(value) !== null && compareDates(value, startDate) >= 0 && compareDates(value, endDate) <= 0;
}

function weekdayIndex(value: string): number | null {
  const timestamp = parseDate(value);
  if (timestamp === null) return null;
  const sundayFirst = new Date(timestamp).getUTCDay();
  return sundayFirst === 0 ? 6 : sundayFirst - 1;
}

function mondayOf(value: string): string | null {
  const index = weekdayIndex(value);
  return index === null ? null : addDays(value, -index);
}

function uniqueDaysInRange(days: readonly InsightsDay[], startDate: string, endDate: string): InsightsDay[] {
  const seen = new Map<string, InsightsDay>();
  for (const day of days) {
    if (!inDateRange(day.logicalDate, startDate, endDate)) continue;
    // A day is a single observation. If a caller passes duplicates, merge activity
    // ids and keep the last non-empty mood so a duplicate cannot inflate a sample.
    const previous = seen.get(day.logicalDate);
    if (!previous) {
      seen.set(day.logicalDate, { ...day, activityIds: [...new Set(day.activityIds)] });
      continue;
    }
    const activityIds = [...new Set([...previous.activityIds, ...day.activityIds])];
    const moodId = day.moodId || previous.moodId;
    seen.set(day.logicalDate, { ...previous, ...day, moodId, activityIds });
  }
  return [...seen.values()].sort((a, b) => compareDates(a.logicalDate, b.logicalDate));
}

function moodSummary(days: readonly InsightsDay[], moods: readonly Mood[]) {
  // Accept readonly collections from chart callers while keeping the shared
  // summarizeMood API free to choose mutable or immutable parameter types.
  return summarizeMood([...days], [...moods]);
}

function makeActivityFrequency(days: readonly InsightsDay[], activityId?: string | null): RhythmActivityFrequency | null {
  if (!activityId) return null;
  const loggedDays = days.length;
  const activityDays = days.reduce((count, day) => count + (day.activityIds.includes(activityId) ? 1 : 0), 0);
  return { activityDays, loggedDays, fraction: loggedDays === 0 ? null : activityDays / loggedDays };
}

function bucketFor({
  key,
  label,
  year,
  days,
  moods,
  activityId,
}: {
  key: string;
  label: string;
  year?: number;
  days: readonly InsightsDay[];
  moods: readonly Mood[];
  activityId?: string | null;
}): RhythmBucket {
  const summary = moodSummary(days, moods);
  return {
    key,
    label,
    ...(year === undefined ? {} : { year }),
    loggedCount: days.length,
    count: summary.count,
    mean: summary.mean,
    goodRate: summary.goodRate,
    distribution: summary.distribution,
    activityFrequency: makeActivityFrequency(days, activityId),
  };
}

function bucketsForDays({
  days,
  moods,
  activityId,
  year,
}: {
  days: readonly InsightsDay[];
  moods: readonly Mood[];
  activityId?: string | null;
  year?: number;
}) {
  const weekdayDays = WEEKDAY_KEYS.map((_, index) => days.filter((day) => weekdayIndex(day.logicalDate) === index));
  const monthDays = RHYTHM_MONTH_LABELS.map((_, index) => days.filter((day) => partsFor(day.logicalDate)?.month === index + 1));
  return {
    weekdays: weekdayDays.map((bucketDays, index) => bucketFor({ key: WEEKDAY_KEYS[index], label: RHYTHM_WEEKDAY_LABELS[index], year, days: bucketDays, moods, activityId })),
    months: monthDays.map((bucketDays, index) => bucketFor({ key: String(index + 1).padStart(2, "0"), label: RHYTHM_MONTH_LABELS[index], year, days: bucketDays, moods, activityId })),
  };
}

function yearSummary(days: readonly InsightsDay[], moods: readonly Mood[], year: number, activityId?: string | null): RhythmYear {
  const yearDays = days.filter((day) => partsFor(day.logicalDate)?.year === year);
  const summary = moodSummary(yearDays, moods);
  const buckets = bucketsForDays({ days: yearDays, moods, activityId, year });
  return { year, loggedCount: yearDays.length, moodCount: summary.count, mean: summary.mean, goodRate: summary.goodRate, ...buckets };
}

/**
 * Summarize weekday and month rhythms. Mood values are null when a bucket has
 * no known mood; activity frequency is an incidence fraction over logged days.
 */
export function summarizeRhythms(input: RhythmAnalysisInput): RhythmAnalysis {
  const startDate = parseDate(input.startDate) === null ? "1000-01-01" : input.startDate;
  const endDate = parseDate(input.endDate) === null ? "9999-12-31" : input.endDate;
  const allDays = uniqueDaysInRange(input.days, startDate, endDate);
  const requestedYear = input.year === undefined || input.year === null ? null : input.year;
  const selectedDays = requestedYear === null ? allDays : allDays.filter((day) => partsFor(day.logicalDate)?.year === requestedYear);
  const years = [...new Set(allDays.map((day) => partsFor(day.logicalDate)?.year).filter((year): year is number => year !== undefined))].sort((a, b) => a - b);
  const summary = moodSummary(selectedDays, input.moods);
  const buckets = bucketsForDays({ days: selectedDays, moods: input.moods, activityId: input.activityId });
  return {
    selectedYear: requestedYear,
    yearOptions: years,
    loggedCount: selectedDays.length,
    moodCount: summary.count,
    ...buckets,
    years: years.map((year) => yearSummary(allDays, input.moods, year, input.activityId)),
  };
}

/** Alias useful to callers that prefer the verb used by the other insight modules. */
export const buildRhythmAnalysis = summarizeRhythms;

function activityIdsForWeek(days: readonly InsightsDay[], activities: readonly Activity[]) {
  const knownIds = new Set(activities.map((activity) => activity.id));
  const counts: Record<string, number> = {};
  for (const day of days) {
    for (const activityId of new Set(day.activityIds)) {
      if (!knownIds.has(activityId)) continue;
      counts[activityId] = (counts[activityId] ?? 0) + 1;
    }
  }
  return counts;
}

function makeWeek({
  weekStart,
  days,
  moods,
  activities,
}: {
  weekStart: string;
  days: readonly InsightsDay[];
  moods: readonly Mood[];
  activities: readonly Activity[];
}): QualifyingWeek {
  const weekEnd = addDays(weekStart, 6) ?? weekStart;
  const summary = moodSummary(days, moods);
  const knownActivityIds = new Set(activities.map((activity) => activity.id));
  const activityDays = activityIdsForWeek(days, activities);
  const activityFrequency = Object.fromEntries(activities.map((activity) => [activity.id, days.length === 0 ? null : (activityDays[activity.id] ?? 0) / days.length]));
  const distinctActivityCount = Object.keys(activityDays).length;
  const totalActivitySelections = days.reduce((total, day) => total + new Set(day.activityIds.filter((id) => knownActivityIds.has(id))).size, 0);
  return {
    weekStart,
    weekEnd,
    label: `${weekStart}–${weekEnd} (Monday–Sunday)`,
    loggedDays: days.length,
    moodCount: summary.count,
    moodMean: summary.mean,
    goodRate: summary.goodRate,
    activityDays,
    activityFrequency,
    activitySpread: days.length === 0 ? null : totalActivitySelections / days.length,
    distinctActivityCount,
    cohort: null,
  };
}

function meanOrNull(values: readonly (number | null)[]): number | null {
  const numbers = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return numbers.length === 0 ? null : numbers.reduce((total, value) => total + value, 0) / numbers.length;
}

function classifyWeeks(weeks: QualifyingWeek[]): { higher: QualifyingWeek[]; typical: QualifyingWeek[]; unclassified: QualifyingWeek[]; threshold: number | null } {
  const moodWeeks = weeks.filter((week) => week.moodMean !== null);
  const unclassified = weeks.filter((week) => week.moodMean === null);
  if (moodWeeks.length < 2) {
    return { higher: [], typical: [...moodWeeks], unclassified, threshold: null };
  }
  const ordered = [...moodWeeks].sort((a, b) => {
    const moodOrder = (b.moodMean ?? -Infinity) - (a.moodMean ?? -Infinity);
    return moodOrder || compareDates(a.weekStart, b.weekStart);
  });
  const distinctMeans = new Set(ordered.map((week) => week.moodMean));
  if (distinctMeans.size < 2) {
    return { higher: [], typical: [...moodWeeks], unclassified, threshold: null };
  }
  // Choose the upper half boundary, then keep every tie at that boundary in the
  // same cohort. This makes the split deterministic without picking a tied week.
  const boundaryIndex = Math.max(0, Math.ceil(ordered.length / 2) - 1);
  let threshold = ordered[boundaryIndex]?.moodMean ?? null;
  // When the boundary is the lowest distinct value, including all ties would
  // swallow the comparison cohort (for example [5, 3, 3, 3]). Move the
  // threshold to the next distinct value so the highest mood band remains
  // visible without selecting an arbitrary week from a tied group.
  const distinctDescending = [...new Set(ordered.map((week) => week.moodMean))]
    .filter((value): value is number => value !== null)
    .sort((a, b) => b - a);
  if (threshold !== null && threshold === distinctDescending[distinctDescending.length - 1] && distinctDescending.length > 1) {
    threshold = distinctDescending[distinctDescending.length - 2] ?? threshold;
  }
  const higher = moodWeeks.filter((week) => week.moodMean !== null && threshold !== null && week.moodMean >= threshold);
  const higherKeys = new Set(higher.map((week) => week.weekStart));
  const typical = moodWeeks.filter((week) => !higherKeys.has(week.weekStart));
  return { higher, typical, unclassified, threshold };
}

function setCohort(weeks: readonly QualifyingWeek[], cohort: WeekCohort): QualifyingWeek[] {
  return weeks.map((week) => ({ ...week, cohort }));
}

function cohortSummary(cohort: WeekCohort, weeks: readonly QualifyingWeek[]): WeekCohortSummary {
  return {
    cohort,
    weekCount: weeks.length,
    moodMean: meanOrNull(weeks.map((week) => week.moodMean)),
    loggedDaysMean: meanOrNull(weeks.map((week) => week.loggedDays)),
    activitySpreadMean: meanOrNull(weeks.map((week) => week.activitySpread)),
  };
}

function compareActivities(activities: readonly Activity[], higherWeeks: readonly QualifyingWeek[], typicalWeeks: readonly QualifyingWeek[]): WeekActivityComparison[] {
  return [...activities]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .map((activity) => {
      const higherFrequency = meanOrNull(higherWeeks.map((week) => week.activityFrequency[activity.id] ?? null));
      const typicalFrequency = meanOrNull(typicalWeeks.map((week) => week.activityFrequency[activity.id] ?? null));
      return {
        activityId: activity.id,
        higherFrequency,
        typicalFrequency,
        difference: higherFrequency === null || typicalFrequency === null ? null : higherFrequency - typicalFrequency,
        higherActivityDays: higherWeeks.reduce((total, week) => total + (week.activityDays[activity.id] ?? 0), 0),
        typicalActivityDays: typicalWeeks.reduce((total, week) => total + (week.activityDays[activity.id] ?? 0), 0),
      };
    });
}

/**
 * Build ended, full Monday-Sunday week cohorts. A week needs at least four
 * distinct logged days by default. Higher weeks are the deterministic upper
 * half of mood-logged weeks, retaining ties at the boundary; equal means yield
 * one typical cohort and no invented "best" week.
 */
export function summarizeBestWeeks(input: BestWeeksAnalysisInput): BestWeeksAnalysis {
  const minimumLoggedDays = Math.max(1, Math.floor(input.minimumLoggedDays ?? MINIMUM_LOGGED_DAYS));
  const startDate = parseDate(input.startDate) === null ? "1000-01-01" : input.startDate;
  const endDate = parseDate(input.endDate) === null ? "9999-12-31" : input.endDate;
  const asOf = parseDate(input.asOf) === null ? endDate : input.asOf;
  const days = uniqueDaysInRange(input.days, startDate, endDate);
  const byWeek = new Map<string, InsightsDay[]>();
  for (const day of days) {
    const weekStart = mondayOf(day.logicalDate);
    if (!weekStart) continue;
    const weekDays = byWeek.get(weekStart) ?? [];
    weekDays.push(day);
    byWeek.set(weekStart, weekDays);
  }
  const weeks = [...byWeek.entries()]
    .sort(([a], [b]) => compareDates(a, b))
    .filter(([weekStart]) => {
      const weekEnd = addDays(weekStart, 6);
      return weekEnd !== null && compareDates(weekStart, startDate) >= 0 && compareDates(weekEnd, endDate) <= 0 && compareDates(weekEnd, asOf) < 0;
    })
    .map(([weekStart, weekDays]) => makeWeek({ weekStart, days: weekDays, moods: input.moods, activities: input.activities }))
    .filter((week) => week.loggedDays >= minimumLoggedDays);

  const classified = classifyWeeks(weeks);
  const higherWeeks = setCohort(classified.higher, "higher");
  const typicalWeeks = setCohort(classified.typical, "typical");
  const unclassifiedWeeks = classified.unclassified.map((week) => ({ ...week, cohort: null }));
  const allWeeks = [...higherWeeks, ...typicalWeeks, ...unclassifiedWeeks].sort((a, b) => compareDates(a.weekStart, b.weekStart));
  return {
    minimumLoggedDays,
    qualifyingWeekCount: allWeeks.length,
    moodLoggedWeekCount: higherWeeks.length + typicalWeeks.length,
    weeks: allWeeks,
    higherWeeks,
    typicalWeeks,
    unclassifiedWeeks,
    higher: cohortSummary("higher", higherWeeks),
    typical: cohortSummary("typical", typicalWeeks),
    activityComparisons: compareActivities(input.activities, higherWeeks, typicalWeeks),
    moodThreshold: classified.threshold,
    cohortMethod: "Qualifying weeks have at least four logged days, run Monday–Sunday, fit wholly inside the selected range, and ended before the as-of date. Higher-mood weeks are the upper half of mood-logged weeks; ties stay together, and equal weekly means produce no separate higher cohort.",
  };
}

/** Alias for callers that prefer an explicit analysis name. */
export const buildBestWeeksAnalysis = summarizeBestWeeks;

export function activityNameById(activities: readonly Activity[]): Map<string, string> {
  return new Map(activities.map((activity) => [activity.id, activity.name]));
}

export function groupActivities(activities: readonly Activity[], groups: readonly ActivityGroup[]): Array<{ group: ActivityGroup | null; activities: Activity[] }> {
  const grouped = new Map<string, Activity[]>();
  for (const activity of activities) {
    const current = grouped.get(activity.groupId) ?? [];
    current.push(activity);
    grouped.set(activity.groupId, current);
  }
  const orderedGroups = [...groups].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const result: Array<{ group: ActivityGroup | null; activities: Activity[] }> = orderedGroups
    .map((group) => ({ group, activities: (grouped.get(group.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)) }))
    .filter((item) => item.activities.length > 0);
  const knownGroupIds = new Set(orderedGroups.map((group) => group.id));
  const other = [...grouped.entries()].filter(([groupId]) => !knownGroupIds.has(groupId)).flatMap(([, groupActivities]) => groupActivities);
  if (other.length > 0) result.push({ group: null, activities: other.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)) });
  return result;
}
