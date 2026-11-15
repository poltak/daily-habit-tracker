import type { Goal, GoalRepeatType } from "../../catalog/types.js";
import {
  addDays,
  dayOfWeek,
  isLogicalDate,
  weekStartsOn,
} from "../../core/utils/logical-date.js";
import type { GoalHistory, GoalHistoryDay, GoalHistoryWeek } from "../types.js";

/** The weekdays of a goal, as a mask: Sunday is the lowest bit. */
export const ALL_WEEKDAYS_MASK = 0b1111111;

type ScheduleGoal = Pick<
  Goal,
  "repeatType" | "weekdaysMask" | "startDate" | "endDate"
>;

export function goalWeekdayMask(
  goal: Pick<Goal, "repeatType" | "weekdaysMask">,
): number {
  if (goal.repeatType === "weekly") {
    return ALL_WEEKDAYS_MASK;
  }
  const mask = goal.weekdaysMask ?? ALL_WEEKDAYS_MASK;
  return Number.isInteger(mask) && mask > 0
    ? mask & ALL_WEEKDAYS_MASK
    : ALL_WEEKDAYS_MASK;
}

function isGoalDateActive(
  goal: Pick<Goal, "startDate" | "endDate">,
  logicalDate: string,
): boolean {
  return (
    (!goal.startDate || logicalDate >= goal.startDate) &&
    (!goal.endDate || logicalDate <= goal.endDate)
  );
}

export function isGoalDateScheduled(
  goal: ScheduleGoal,
  logicalDate: string,
): boolean {
  return (
    isGoalDateActive(goal, logicalDate) &&
    (goalWeekdayMask(goal) & (1 << dayOfWeek(logicalDate))) !== 0
  );
}

function startOfWeek({
  date,
  weekEndsOn,
}: {
  date: string;
  weekEndsOn: number;
}): string {
  return addDays(date, -((dayOfWeek(date) - weekStartsOn(weekEndsOn) + 7) % 7));
}

function datesOfWeek(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, offset) => addDays(weekStart, offset));
}

function weekStatus({
  activeDates,
  completedCount,
  expectedCount,
  openCount,
  asOf,
}: {
  activeDates: readonly string[];
  completedCount: number;
  expectedCount: number;
  openCount: number;
  asOf: string;
}): GoalHistoryWeek["status"] {
  // Upcoming: the week, or the goal's active period in it, has not begun.
  if ((activeDates[0] ?? "") > asOf) {
    return "upcoming";
  }
  // Accomplished: the target is met, even before the week ends.
  if (completedCount >= expectedCount) {
    return "accomplished";
  }
  // Not accomplished: the target is out of reach, even if every open day gets completed.
  return completedCount + openCount < expectedCount
    ? "not_accomplished"
    : "in_progress";
}

/**
 * The days of a range and the weeks that touch it. A goal counts from its
 * start date, or from its first completion when that came earlier, for
 * example a goal ticked for yesterday after midnight.
 */
export function buildGoalHistory({
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
  /** The earliest completion on any date, which may lie outside the range. */
  firstCompletedDate: string | null;
  weekEndsOn: number;
  asOf: string;
}): GoalHistory {
  if (
    !isLogicalDate(startDate) ||
    !isLogicalDate(endDate) ||
    startDate > endDate ||
    !isLogicalDate(asOf)
  ) {
    throw new Error("Choose a valid history range.");
  }
  const goal =
    storedGoal.startDate &&
    firstCompletedDate &&
    firstCompletedDate < storedGoal.startDate
      ? { ...storedGoal, startDate: firstCompletedDate }
      : storedGoal;
  const completed = new Set(completedDates);
  const repeatType: GoalRepeatType = goal.repeatType;

  const days: GoalHistoryDay[] = [];
  for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
    days.push({
      logicalDate: date,
      completed: completed.has(date),
      scheduled: isGoalDateScheduled(goal, date),
    });
  }

  const weeks: GoalHistoryWeek[] = [];
  for (
    let weekStart = startOfWeek({ date: startDate, weekEndsOn });
    weekStart <= endDate;
    weekStart = addDays(weekStart, 7)
  ) {
    const activeDates = datesOfWeek(weekStart).filter((date) =>
      isGoalDateActive(goal, date),
    );
    const evaluationDates =
      repeatType === "weekly"
        ? activeDates
        : activeDates.filter((date) => isGoalDateScheduled(goal, date));
    if (evaluationDates.length === 0) {
      continue;
    }
    const completedCount = evaluationDates.filter((date) =>
      completed.has(date),
    ).length;
    const expectedCount =
      repeatType === "weekly"
        ? Math.min(goal.targetPerWeek ?? 1, evaluationDates.length)
        : evaluationDates.length;
    // Days from today onward that are not completed yet can still count toward the target.
    const openCount = evaluationDates.filter(
      (date) => date >= asOf && !completed.has(date),
    ).length;
    const status = weekStatus({
      activeDates,
      completedCount,
      expectedCount,
      openCount,
      asOf,
    });
    weeks.push({
      weekStart,
      weekEnd: addDays(weekStart, 6),
      completedCount,
      expectedCount,
      repeatType,
      status,
      accomplished:
        status === "accomplished"
          ? true
          : status === "not_accomplished"
            ? false
            : null,
    });
  }
  return {
    goal: storedGoal,
    month: startDate.slice(0, 7),
    startDate,
    endDate,
    asOf,
    days,
    weeks,
  };
}
