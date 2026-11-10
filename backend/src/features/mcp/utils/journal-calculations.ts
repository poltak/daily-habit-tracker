/**
 * The calculations behind the summary tools and the goal history tool. They
 * are pure, and they work on plain days and catalog records. The insights and
 * goals features of the app calculate the same values for their pages; keep
 * the rules the same as theirs.
 */
import type { Goal, Mood } from "@app/common/features/catalog/types";
import {
  addDays,
  dayOfWeek,
  weekStartsOn,
} from "@app/common/features/core/utils/logical-date";

const ALL_WEEKDAYS_MASK = 0b1111111;
/** An activity with fewer days than this on one side is weak evidence. */
const SMALL_SAMPLE_DAYS = 10;
const DAY_MS = 86_400_000;

export interface SummarizedDay {
  logicalDate: string;
  moodId: string;
  activityIds: readonly string[];
}

export interface MoodSummary {
  count: number;
  mean: number | null;
  goodRate: number | null;
  /** Every mood, worst first. */
  distribution: { moodId: string; count: number }[];
}

export function round(value: number | null, digits = 2): number | null {
  return value === null ? null : Number(value.toFixed(digits));
}

/** The number of days from `startDate` to `endDate`, both included. */
export function countDays({
  startDate,
  endDate,
}: {
  startDate: string;
  endDate: string;
}): number {
  return Math.max(
    0,
    Math.round((Date.parse(endDate) - Date.parse(startDate)) / DAY_MS) + 1,
  );
}

/** The first day of the week that holds `logicalDate`. */
export function startOfWeek({
  logicalDate,
  weekEndsOn,
}: {
  logicalDate: string;
  weekEndsOn: number;
}): string {
  return addDays(
    logicalDate,
    -((dayOfWeek(logicalDate) - weekStartsOn(weekEndsOn) + 7) % 7),
  );
}

/** A day with a mood that is not in the catalog counts for nothing. */
export function summarizeMood({
  days,
  moods,
}: {
  days: readonly SummarizedDay[];
  moods: readonly Mood[];
}): MoodSummary {
  const known = new Map(moods.map((mood) => [mood.id, mood]));
  const counts = new Map<string, number>();
  let count = 0;
  let total = 0;
  let good = 0;
  for (const day of days) {
    const mood = known.get(day.moodId);
    if (!mood) {
      continue;
    }
    count += 1;
    total += mood.score;
    good += mood.score >= 4 ? 1 : 0;
    counts.set(mood.id, (counts.get(mood.id) ?? 0) + 1);
  }
  return {
    count,
    mean: count ? total / count : null,
    goodRate: count ? good / count : null,
    distribution: moods
      .toSorted((a, b) => a.score - b.score)
      .map((mood) => ({ moodId: mood.id, count: counts.get(mood.id) ?? 0 })),
  };
}

export interface ActivityAssociation {
  activityId: string;
  recorded: MoodSummary;
  notRecorded: MoodSummary;
  meanDifference: number | null;
  small: boolean;
}

function difference(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : a - b;
}

/**
 * The activities ranked by the difference of the mean mood on the days that
 * have them and on the days that do not. It describes an association and does
 * not show a cause. An activity with no day on either side is left out.
 */
export function rankActivityAssociations({
  days,
  moods,
  activityIds,
}: {
  days: readonly SummarizedDay[];
  moods: readonly Mood[];
  activityIds: readonly string[];
}): ActivityAssociation[] {
  const rows = activityIds.map((activityId) => {
    const recorded = days.filter((day) => day.activityIds.includes(activityId));
    const notRecorded = days.filter(
      (day) => !day.activityIds.includes(activityId),
    );
    const recordedSummary = summarizeMood({ days: recorded, moods });
    const notRecordedSummary = summarizeMood({ days: notRecorded, moods });
    const meanDifference = difference(
      recordedSummary.mean,
      notRecordedSummary.mean,
    );
    return {
      activityId,
      recorded: recordedSummary,
      notRecorded: notRecordedSummary,
      meanDifference,
      goodRateDifference: difference(
        recordedSummary.goodRate,
        notRecordedSummary.goodRate,
      ),
      small:
        recordedSummary.count < SMALL_SAMPLE_DAYS ||
        notRecordedSummary.count < SMALL_SAMPLE_DAYS,
    };
  });
  return rows
    .filter((row) => row.recorded.count > 0 || row.notRecorded.count > 0)
    .toSorted((a, b) => {
      const scoreA = a.meanDifference ?? a.goodRateDifference;
      const scoreB = b.meanDifference ?? b.goodRateDifference;
      if (scoreA === null && scoreB !== null) {
        return 1;
      }
      if (scoreA !== null && scoreB === null) {
        return -1;
      }
      if (scoreA !== null && scoreB !== null && scoreA !== scoreB) {
        return scoreB - scoreA;
      }
      if (a.recorded.count !== b.recorded.count) {
        return b.recorded.count - a.recorded.count;
      }
      return a.activityId.localeCompare(b.activityId);
    });
}

export interface GoalWeek {
  weekStart: string;
  weekEnd: string;
  status: "accomplished" | "not_accomplished" | "in_progress" | "upcoming";
  completedCount: number;
  expectedCount: number;
}

function isActive(
  goal: Pick<Goal, "startDate" | "endDate">,
  logicalDate: string,
): boolean {
  return (
    (!goal.startDate || logicalDate >= goal.startDate) &&
    (!goal.endDate || logicalDate <= goal.endDate)
  );
}

function isScheduled(goal: Goal, logicalDate: string): boolean {
  if (!isActive(goal, logicalDate)) {
    return false;
  }
  const mask =
    goal.repeatType === "weekly"
      ? ALL_WEEKDAYS_MASK
      : (goal.weekdaysMask ?? ALL_WEEKDAYS_MASK);
  return (mask & (1 << dayOfWeek(logicalDate))) !== 0;
}

/**
 * The result of each week that touches the range. A goal counts from its start
 * date, or from its first completion when that came earlier. A week is
 * `accomplished` when the target is met, `not_accomplished` when the open days
 * left cannot meet it, `upcoming` when the goal has not begun in it, and
 * `in_progress` otherwise.
 */
export function buildGoalWeeks({
  goal: storedGoal,
  startDate,
  endDate,
  completedDates,
  firstCompletedDate,
  weekEndsOn,
  asOf,
}: {
  goal: Goal;
  startDate: string;
  endDate: string;
  completedDates: Iterable<string>;
  firstCompletedDate: string | null;
  weekEndsOn: number;
  asOf: string;
}): GoalWeek[] {
  const goal =
    storedGoal.startDate &&
    firstCompletedDate &&
    firstCompletedDate < storedGoal.startDate
      ? { ...storedGoal, startDate: firstCompletedDate }
      : storedGoal;
  const completed = new Set(completedDates);
  const weeks: GoalWeek[] = [];
  for (
    let weekStart = startOfWeek({ logicalDate: startDate, weekEndsOn });
    weekStart <= endDate;
    weekStart = addDays(weekStart, 7)
  ) {
    const weekDates = Array.from({ length: 7 }, (_, offset) =>
      addDays(weekStart, offset),
    );
    const activeDates = weekDates.filter((date) => isActive(goal, date));
    const evaluationDates =
      goal.repeatType === "weekly"
        ? activeDates
        : activeDates.filter((date) => isScheduled(goal, date));
    const [firstActive] = activeDates;
    if (evaluationDates.length === 0 || firstActive === undefined) {
      continue;
    }
    const completedCount = evaluationDates.filter((date) =>
      completed.has(date),
    ).length;
    const expectedCount =
      goal.repeatType === "weekly"
        ? Math.min(goal.targetPerWeek ?? 1, evaluationDates.length)
        : evaluationDates.length;
    // A day from today on that is not complete yet can still count toward the target.
    const openCount = evaluationDates.filter(
      (date) => date >= asOf && !completed.has(date),
    ).length;
    const status: GoalWeek["status"] =
      firstActive > asOf
        ? "upcoming"
        : completedCount >= expectedCount
          ? "accomplished"
          : completedCount + openCount < expectedCount
            ? "not_accomplished"
            : "in_progress";
    weeks.push({
      weekStart,
      weekEnd: addDays(weekStart, 6),
      status,
      completedCount,
      expectedCount,
    });
  }
  return weeks;
}
