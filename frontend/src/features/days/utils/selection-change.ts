import type { Goal } from "@app/common/features/catalog/types";
import type {
  DayActivitySelection,
  Entry,
  GoalCompletion,
} from "@app/common/features/days/types";
import { applyToggles, type Draft } from "./draft.js";

/** What the server answers to the tap on an activity. */
interface ActivityResult {
  selection?: DayActivitySelection | undefined;
  affectedGoalCompletions: GoalCompletion[];
  affectedActivitySelections: DayActivitySelection[];
}

const toggle = (id: string, on: boolean) => [id, on] as const;

/** The draft after a tap on an activity, and what is needed to undo the tap. */
export function planActivityChange({
  draft,
  goals,
  activityId,
}: {
  draft: Draft;
  goals: readonly Goal[];
  activityId: string;
}) {
  const linkedGoalIds = goals
    .filter((goal) => !goal.archived && goal.activityId === activityId)
    .map((goal) => goal.id);
  const wasSelected = draft.activityIds.includes(activityId);
  const selected = !wasSelected;
  return {
    selected,
    linkedGoalIds,
    nextDraft: {
      ...draft,
      activityIds: applyToggles(draft.activityIds, [
        toggle(activityId, selected),
      ]),
      completedGoalIds: applyToggles(
        draft.completedGoalIds,
        linkedGoalIds.map((goalId) => toggle(goalId, selected)),
      ),
    },
    undo: {
      activity: toggle(activityId, wasSelected),
      goals: linkedGoalIds.map((goalId) =>
        toggle(goalId, draft.completedGoalIds.includes(goalId)),
      ),
    },
  };
}

/** The answer must name the activity and the goals of the tap, as the tap changed them. */
export function isExpectedActivityResult({
  result,
  activityId,
  selected,
  linkedGoalIds,
}: {
  result: ActivityResult;
  activityId: string;
  selected: boolean;
  linkedGoalIds: readonly string[];
}): boolean {
  const completions = result.affectedGoalCompletions;
  return (
    result.selection?.activityId === activityId &&
    result.selection.selected === selected &&
    completions.length === linkedGoalIds.length &&
    linkedGoalIds.every((goalId) =>
      completions.some(
        (completion) =>
          completion.goalId === goalId && completion.completed === selected,
      ),
    )
  );
}

/** The activities and the goals that the server changed, applied to a draft or an entry. */
export function applyActivityResult<
  Target extends Pick<Draft | Entry, "activityIds" | "completedGoalIds">,
>({ target, result }: { target: Target; result: ActivityResult }): Target {
  return {
    ...target,
    activityIds: applyToggles(
      target.activityIds,
      result.affectedActivitySelections.map((item) =>
        toggle(item.activityId, item.selected),
      ),
    ),
    completedGoalIds: applyToggles(
      target.completedGoalIds,
      result.affectedGoalCompletions.map((item) =>
        toggle(item.goalId, item.completed),
      ),
    ),
  };
}

export function undoActivityChange({
  draft,
  undo,
}: {
  draft: Draft;
  undo: ReturnType<typeof planActivityChange>["undo"];
}): Draft {
  return {
    ...draft,
    activityIds: applyToggles(draft.activityIds, [undo.activity]),
    completedGoalIds: applyToggles(draft.completedGoalIds, undo.goals),
  };
}
