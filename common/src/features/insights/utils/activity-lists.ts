import type { Activity, ActivityGroup } from "../../catalog/types.js";

function byOrder(a: Activity, b: Activity): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
}

export function activityNameById(
  activities: readonly Activity[],
): Map<string, string> {
  return new Map(activities.map((activity) => [activity.id, activity.name]));
}

/** The activities of each group in the order of the groups, then the activities of no known group. */
export function groupActivities(
  activities: readonly Activity[],
  groups: readonly ActivityGroup[],
): Array<{ group: ActivityGroup | null; activities: Activity[] }> {
  const grouped = new Map<string, Activity[]>();
  for (const activity of activities) {
    grouped.set(activity.groupId, [
      ...(grouped.get(activity.groupId) ?? []),
      activity,
    ]);
  }
  const orderedGroups = [...groups].toSorted(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
  const result: Array<{ group: ActivityGroup | null; activities: Activity[] }> =
    orderedGroups
      .map((group) => ({
        group,
        activities: (grouped.get(group.id) ?? []).toSorted(byOrder),
      }))
      .filter((item) => item.activities.length > 0);
  const knownGroupIds = new Set(orderedGroups.map((group) => group.id));
  const other = [...grouped.entries()]
    .filter(([groupId]) => !knownGroupIds.has(groupId))
    .flatMap(([, members]) => members);
  if (other.length > 0) {
    result.push({ group: null, activities: other.toSorted(byOrder) });
  }
  return result;
}
