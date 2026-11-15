import type { Goal } from "@app/common/features/catalog/types";
import type { GoalCompletion } from "@app/common/features/days/types";
import type { ActivityResult } from "../ui/selection-plugin.js";
import { applyToggles, type Draft } from "./draft.js";

/** What the server answers to the tap on the switch of a goal. */
export interface GoalResult extends ActivityResult {
  completion: GoalCompletion;
}

const toggle = (id: string, on: boolean) => [id, on] as const;

/**
 * The draft after a tap on the switch of a goal, and what is needed to undo
 * the tap. A goal with an activity changes the activity and every goal that
 * the activity completes. A goal without an activity changes alone.
 */
export function planGoalChange({
  draft,
  goals,
  goalId,
}: {
  draft: Draft;
  goals: readonly Goal[];
  goalId: string;
}) {
  const goal = goals.find((candidate) => candidate.id === goalId);
  if (!goal) {
    return null;
  }
  const activityId = goal.activityId;
  const affectedGoalIds = activityId
    ? goals
        .filter((other) => !other.archived && other.activityId === activityId)
        .map((other) => other.id)
    : [goalId];
  const completed = !draft.completedGoalIds.includes(goalId);
  const previousGoals = affectedGoalIds.map((id) =>
    toggle(id, draft.completedGoalIds.includes(id)),
  );
  const previousActivity = activityId
    ? [toggle(activityId, draft.activityIds.includes(activityId))]
    : [];
  return {
    completed,
    activityId,
    affectedGoalIds,
    nextDraft: {
      ...draft,
      activityIds: activityId
        ? applyToggles(draft.activityIds, [toggle(activityId, completed)])
        : draft.activityIds,
      completedGoalIds: applyToggles(
        draft.completedGoalIds,
        affectedGoalIds.map((id) => toggle(id, completed)),
      ),
    },
    undo: (current: Draft): Draft => ({
      ...current,
      activityIds: applyToggles(current.activityIds, previousActivity),
      completedGoalIds: applyToggles(current.completedGoalIds, previousGoals),
    }),
  };
}

/** The answer must name the goal, the goals that follow it and its activity, as the tap changed them. */
export function isExpectedGoalResult({
  result,
  goalId,
  completed,
  activityId,
  affectedGoalIds,
}: {
  result: GoalResult;
  goalId: string;
  completed: boolean;
  activityId: string | null;
  affectedGoalIds: readonly string[];
}): boolean {
  const completions = result.affectedGoalCompletions;
  return (
    result.completion.goalId === goalId &&
    result.completion.completed === completed &&
    completions.length === affectedGoalIds.length &&
    affectedGoalIds.every((id) =>
      completions.some(
        (completion) =>
          completion.goalId === id && completion.completed === completed,
      ),
    ) &&
    (activityId === null ||
      result.affectedActivitySelections.some(
        (selection) =>
          selection.activityId === activityId &&
          selection.selected === completed,
      ))
  );
}
