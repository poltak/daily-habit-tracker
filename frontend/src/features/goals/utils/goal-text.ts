import type { Goal } from "@app/common/features/catalog/types";
import type { GoalWeekStatus } from "@app/common/features/goals/types";

const STATUS_LABELS: Record<GoalWeekStatus, string> = {
  accomplished: "Accomplished",
  not_accomplished: "Not accomplished",
  in_progress: "In progress",
  upcoming: "Upcoming",
};

const STATUS_ICONS: Record<GoalWeekStatus, string> = {
  accomplished: "check",
  not_accomplished: "close",
  in_progress: "hourglass_top",
  upcoming: "event",
};

export function statusLabel(status: GoalWeekStatus): string {
  return STATUS_LABELS[status];
}

export function statusIcon(status: GoalWeekStatus): string {
  return STATUS_ICONS[status];
}

/** The sentence above the calendar of a goal. */
export function explainer(goal: Goal): string {
  if (goal.repeatType === "daily") {
    return "Green days are completed; pale days are not completed. A dash marks an expected day.";
  }
  const days = goal.targetPerWeek ?? 1;
  return `Green days are completed. Each week needs ${days} completed ${days === 1 ? "day" : "days"}.`;
}
