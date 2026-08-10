export type ActivityGroupSummary = {
  activityCount: number;
  selectedCount: number;
};

export function summarizeActivityGroup({ activityIds, selectedActivityIds }: { activityIds: readonly string[]; selectedActivityIds: readonly string[] }): ActivityGroupSummary {
  const selected = new Set(selectedActivityIds);
  return {
    activityCount: activityIds.length,
    selectedCount: activityIds.reduce((count, id) => count + (selected.has(id) ? 1 : 0), 0),
  };
}
