import type { Activity, ActivityGroup } from "../types.js";

export interface ActivityGroupResult {
  group: ActivityGroup;
  activities: Activity[];
  activeCount: number;
  archivedCount: number;
}

/**
 * The groups with their activities in display order. A search keeps the
 * activities whose name has the text, and drops each group that has none.
 */
export function filterActivityGroups({
  groups,
  activities,
  query = "",
  includeArchived = false,
  includeEmpty = false,
}: {
  groups: readonly ActivityGroup[];
  activities: readonly Activity[];
  query?: string;
  includeArchived?: boolean;
  /** Keep the groups that have no matching activity. */
  includeEmpty?: boolean;
}): ActivityGroupResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  const results = new Map<string, ActivityGroupResult>();
  for (const group of groups) {
    if (includeArchived || !group.archived) {
      results.set(group.id, {
        group,
        activities: [],
        activeCount: 0,
        archivedCount: 0,
      });
    }
  }
  for (const activity of activities) {
    const result = results.get(activity.groupId);
    if (!result || (!includeArchived && activity.archived)) {
      continue;
    }
    if (
      normalizedQuery &&
      !activity.name.toLowerCase().includes(normalizedQuery)
    ) {
      continue;
    }
    result.activities.push(activity);
    if (activity.archived) {
      result.archivedCount += 1;
    } else {
      result.activeCount += 1;
    }
  }
  return [...results.values()]
    .filter((result) => includeEmpty || result.activities.length > 0)
    .toSorted((a, b) => a.group.sortOrder - b.group.sortOrder)
    .map((result) => ({
      ...result,
      activities: result.activities.toSorted(
        (a, b) => a.sortOrder - b.sortOrder,
      ),
    }));
}
