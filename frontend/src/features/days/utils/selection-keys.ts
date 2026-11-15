/** The key of the mood. A day has one mood, so one tap on it waits at a time. */
export const MOOD_KEY = "mood";

export const activityKey = (activityId: string) => `activity:${activityId}`;

export const goalKey = (goalId: string) => `goal:${goalId}`;

/** A tap on an activity also changes the goals that follow it. */
export function activityTapKeys({
  activityId,
  linkedGoalIds,
}: {
  activityId: string;
  linkedGoalIds: readonly string[];
}): string[] {
  return [activityKey(activityId), ...linkedGoalIds.map(goalKey)];
}

/** A tap on a goal also changes its activity and the goals that share the activity. */
export function goalTapKeys({
  goalId,
  activityId,
  affectedGoalIds,
}: {
  goalId: string;
  activityId: string | null;
  affectedGoalIds: readonly string[];
}): string[] {
  return [
    ...[...new Set([goalId, ...affectedGoalIds])].map(goalKey),
    ...(activityId ? [activityKey(activityId)] : []),
  ];
}
