/**
 * The calculations behind the goal history tool. They are pure. The goals
 * feature of the app calculates the same values for its page; keep the rules
 * the same as theirs. The mood and activity summaries come from
 * `common/features/insights`.
 */
import type { Goal } from "@app/common/features/catalog/types";
import {
  addDays,
  dayOfWeek,
  weekStartsOn,
} from "@app/common/features/core/utils/logical-date";

const ALL_WEEKDAYS_MASK = 0b1111111;

export function round(value: number | null, digits = 2): number | null {
  return value === null ? null : Number(value.toFixed(digits));
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
