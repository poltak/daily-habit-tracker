/** The history of one goal as `GET /api/goals/:goalId/history` gives it. */
import type { Goal, GoalRepeatType } from "../catalog/types.js";

export interface GoalHistoryDay {
  logicalDate: string;
  completed: boolean;
  scheduled: boolean;
}

export type GoalWeekStatus =
  "accomplished" | "not_accomplished" | "in_progress" | "upcoming";

export interface GoalHistoryWeek {
  weekStart: string;
  weekEnd: string;
  completedCount: number;
  expectedCount: number;
  repeatType: GoalRepeatType;
  status: GoalWeekStatus;
  accomplished: boolean | null;
}

export interface GoalHistory {
  goal: Goal;
  /** `YYYY-MM`. */
  month: string;
  startDate: string;
  endDate: string;
  asOf: string;
  days: GoalHistoryDay[];
  weeks: GoalHistoryWeek[];
}
