import type { Activity, ActivityGroup } from "./daylio";

export type ActivityGroupSummary = {
  activityCount: number;
  selectedCount: number;
};

export type ActivityGroupResult = {
  group: ActivityGroup;
  activities: Activity[];
  activeCount: number;
  archivedCount: number;
};

export function filterActivityGroups({
  groups,
  activities,
  query = "",
  includeArchived = false,
}: {
  groups: readonly ActivityGroup[];
  activities: readonly Activity[];
  query?: string;
  includeArchived?: boolean;
}): ActivityGroupResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  const results = new Map<string, ActivityGroupResult>();
  for (const group of groups) {
    if (includeArchived || !group.archived) {
      results.set(group.id, { group, activities: [], activeCount: 0, archivedCount: 0 });
    }
  }
  for (const activity of activities) {
    const result = results.get(activity.groupId);
    if (!result || (!includeArchived && activity.archived)) continue;
    if (normalizedQuery && !activity.name.toLowerCase().includes(normalizedQuery)) continue;
    result.activities.push(activity);
    if (activity.archived) result.archivedCount += 1;
    else result.activeCount += 1;
  }
  return [...results.values()]
    .filter((result) => result.activities.length > 0)
    .sort((a, b) => a.group.sortOrder - b.group.sortOrder)
    .map((result) => {
      result.activities.sort((a, b) => a.sortOrder - b.sortOrder);
      return result;
    });
}

export function summarizeActivityGroup({ activityIds, selectedActivityIds }: { activityIds: readonly string[]; selectedActivityIds: readonly string[] }): ActivityGroupSummary {
  const selected = new Set(selectedActivityIds);
  return {
    activityCount: activityIds.length,
    selectedCount: activityIds.reduce((count, id) => count + (selected.has(id) ? 1 : 0), 0),
  };
}
