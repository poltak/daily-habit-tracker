import type {
  Activity,
  ActivityGroup,
  Goal,
  Mood,
} from "@app/common/features/catalog/types";
import { isActivityIcon } from "@app/common/features/catalog/utils/activity-icons";
import { iconForActivity } from "@app/common/features/catalog/utils/activity-icon";
import type {
  ActivityGroupRow,
  ActivityRow,
  GoalRow,
  MoodRow,
} from "../storage/types.js";

/** The icon that stands for an activity whose stored icon is the old placeholder. */
const PLACEHOLDER_ICON = "✨";

/** The icon of a goal that has none, or one that the icon list does not have. */
export const DEFAULT_GOAL_ICON = "task_alt";

export function toMood(row: MoodRow): Mood {
  return {
    id: row.id,
    name: row.name,
    score: row.score,
    emoji: row.emoji,
    color: row.color,
  };
}

export function toGroup(row: ActivityGroupRow): ActivityGroup {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    archived: Boolean(row.archivedAt),
  };
}

export function toActivity(row: ActivityRow): Activity {
  const icon = iconForActivity({
    name: row.name,
    sourceIconId:
      row.materialIcon !== PLACEHOLDER_ICON
        ? row.materialIcon
        : (row.sourceIconId ?? undefined),
  });
  return {
    id: row.id,
    groupId: row.groupId,
    name: row.name,
    icon,
    ...(row.sourceIconId === null ? {} : { sourceIconId: row.sourceIconId }),
    sortOrder: row.sortOrder,
    archived: Boolean(row.archivedAt),
  };
}

export function toGoal(row: GoalRow): Goal {
  const repeatType =
    row.repeatType === "weekly" || row.scheduleType === "times_per_week"
      ? "weekly"
      : "daily";
  return {
    id: row.id,
    activityId: row.activityId,
    name: row.name,
    materialIcon: isActivityIcon(row.materialIcon)
      ? row.materialIcon
      : DEFAULT_GOAL_ICON,
    repeatType,
    scheduleType: row.scheduleType as Goal["scheduleType"],
    ...(row.targetPerWeek === null ? {} : { targetPerWeek: row.targetPerWeek }),
    ...(row.weekdaysMask === null ? {} : { weekdaysMask: row.weekdaysMask }),
    ...(row.startDate === null ? {} : { startDate: row.startDate }),
    ...(row.endDate === null ? {} : { endDate: row.endDate }),
    sortOrder: row.sortOrder,
    archived: Boolean(row.archivedAt),
    reminderEnabled: Boolean(row.reminderEnabled),
    ...(row.reminderTime === null ? {} : { reminderTime: row.reminderTime }),
    ...(row.sourceState === null ? {} : { sourceState: row.sourceState }),
  };
}
