import type { Goal, GoalRepeatType } from "../types.js";

/** One bit for each weekday, Sunday first. */
export const ALL_WEEKDAYS_MASK = 0b1111111;

export function goalRepeatType(
  goal: Pick<Goal, "repeatType" | "scheduleType">,
): GoalRepeatType {
  if (goal.repeatType === "weekly" || goal.repeatType === "daily") {
    return goal.repeatType;
  }
  return goal.scheduleType === "times_per_week" ? "weekly" : "daily";
}

/** The weekdays a goal is expected on. A weekly goal has no fixed weekday. */
export function goalWeekdayMask(
  goal: Pick<Goal, "repeatType" | "scheduleType" | "weekdaysMask">,
): number {
  if (goalRepeatType(goal) === "weekly") {
    return ALL_WEEKDAYS_MASK;
  }
  const mask = goal.weekdaysMask ?? ALL_WEEKDAYS_MASK;
  return Number.isInteger(mask) && mask > 0
    ? mask & ALL_WEEKDAYS_MASK
    : ALL_WEEKDAYS_MASK;
}

export interface GoalConfigInput {
  /** A request can send any text, and `normalizeGoalConfig` refuses the wrong ones. */
  repeatType?: string | undefined;
  scheduleType?: string | undefined;
  targetPerWeek?: number | null | undefined;
  weekdaysMask?: number | null | undefined;
}

export type GoalConfigResult =
  | {
      ok: true;
      repeatType: GoalRepeatType;
      scheduleType: Goal["scheduleType"];
      targetPerWeek: number | null;
      weekdaysMask: number | null;
    }
  | { ok: false; message: string };

/** The schedule columns of a goal that agree with each other, or the reason they do not. */
export function normalizeGoalConfig(input: GoalConfigInput): GoalConfigResult {
  if (
    input.scheduleType !== undefined &&
    !["daily", "weekdays", "times_per_week"].includes(input.scheduleType)
  ) {
    return { ok: false, message: "Choose Daily or Weekly for goal repeat." };
  }
  if (
    input.repeatType !== undefined &&
    input.repeatType !== "daily" &&
    input.repeatType !== "weekly"
  ) {
    return { ok: false, message: "Choose Daily or Weekly for goal repeat." };
  }
  const repeatType: GoalRepeatType =
    input.repeatType === "daily" || input.repeatType === "weekly"
      ? input.repeatType
      : input.scheduleType === "times_per_week"
        ? "weekly"
        : "daily";
  if (repeatType === "weekly") {
    const targetPerWeek = input.targetPerWeek ?? 1;
    if (
      !Number.isInteger(targetPerWeek) ||
      targetPerWeek < 1 ||
      targetPerWeek > 7
    ) {
      return {
        ok: false,
        message: "Weekly goals must target between 1 and 7 days.",
      };
    }
    return {
      ok: true,
      repeatType,
      scheduleType: "times_per_week",
      targetPerWeek,
      weekdaysMask: null,
    };
  }
  const weekdaysMask = input.weekdaysMask ?? ALL_WEEKDAYS_MASK;
  if (
    !Number.isInteger(weekdaysMask) ||
    weekdaysMask < 1 ||
    weekdaysMask > ALL_WEEKDAYS_MASK
  ) {
    return {
      ok: false,
      message: "Daily goals must include at least one weekday.",
    };
  }
  return {
    ok: true,
    repeatType: "daily",
    scheduleType: weekdaysMask === ALL_WEEKDAYS_MASK ? "daily" : "weekdays",
    targetPerWeek: null,
    weekdaysMask,
  };
}
