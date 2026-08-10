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

  return groups
    .filter((group) => includeArchived || !group.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((group) => {
      const groupActivities = activities
        .filter((activity) => activity.groupId === group.id)
        .filter((activity) => includeArchived || !activity.archived)
        .filter((activity) => !normalizedQuery || activity.name.toLowerCase().includes(normalizedQuery))
        .sort((a, b) => a.sortOrder - b.sortOrder);

      return {
        group,
        activities: groupActivities,
        activeCount: groupActivities.filter((activity) => !activity.archived).length,
        archivedCount: groupActivities.filter((activity) => activity.archived).length,
      };
    })
    .filter((result) => result.activities.length > 0);
}

export function summarizeActivityGroup({ activityIds, selectedActivityIds }: { activityIds: readonly string[]; selectedActivityIds: readonly string[] }): ActivityGroupSummary {
  const selected = new Set(selectedActivityIds);
  return {
    activityCount: activityIds.length,
    selectedCount: activityIds.reduce((count, id) => count + (selected.has(id) ? 1 : 0), 0),
  };
}
