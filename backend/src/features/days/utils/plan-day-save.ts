import { AppError } from "../../core/errors/app-error.js";

interface GoalLink {
  id: string;
  activityId: string | null;
  archived: boolean;
}

/**
 * The activities and the goal completions of a save of a whole day. A goal
 * with an activity is complete exactly when its activity is selected, and the
 * activity of a goal that the caller completes is selected too. A goal without
 * an activity changes only when `completedGoalIds` is given.
 */
export function planDaySave({
  goals,
  activityIds,
  completedGoalIds,
}: {
  goals: readonly GoalLink[];
  activityIds: readonly string[];
  completedGoalIds?: readonly string[] | undefined;
}): {
  activityIds: string[];
  completeGoalIds: string[];
  clearGoalIds: string[];
} {
  const goalsById = new Map(goals.map((goal) => [goal.id, goal]));
  const activities = new Set(activityIds);
  for (const goalId of completedGoalIds ?? []) {
    const goal = goalsById.get(goalId);
    if (!goal) {
      throw new AppError({
        code: "INVALID_REQUEST",
        message: "One goal is no longer available.",
      });
    }
    if (goal.archived) {
      throw new AppError({
        code: "INVALID_REQUEST",
        message: "An archived goal cannot be marked completed.",
      });
    }
    if (goal.activityId) {
      activities.add(goal.activityId);
    }
  }
  const explicit = completedGoalIds ? new Set(completedGoalIds) : null;
  const completeGoalIds: string[] = [];
  const clearGoalIds: string[] = [];
  for (const goal of goals) {
    if (goal.archived) {
      continue;
    }
    const completed = goal.activityId
      ? activities.has(goal.activityId)
      : explicit
        ? explicit.has(goal.id)
        : null;
    if (completed === true) {
      completeGoalIds.push(goal.id);
    } else if (completed === false) {
      clearGoalIds.push(goal.id);
    }
  }
  return { activityIds: [...activities], completeGoalIds, clearGoalIds };
}
