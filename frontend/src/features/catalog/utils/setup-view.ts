import type {
  Activity,
  ActivityGroup,
  Goal,
} from "@app/common/features/catalog/types";
import {
  filterActivityGroups,
  type ActivityGroupResult,
} from "@app/common/features/catalog/utils/activity-groups";
import {
  catalogKey,
  mergeCatalogOverride,
  sortCatalogItems,
  type CatalogOverrides,
} from "./catalog-mutations.js";

export interface SetupView {
  groups: ActivityGroup[];
  activities: Activity[];
  goals: Goal[];
  /** The groups that show, with their activities. A filter keeps only the groups with a match. */
  groupedActivities: ActivityGroupResult[];
  activeGroupCount: number;
  activeActivityCount: number;
}

/** The catalog with the changes that the server has not confirmed yet, as the Setup page lists it. */
export function buildSetupView({
  groups,
  activities,
  goals,
  overrides,
  query,
}: {
  groups: readonly ActivityGroup[];
  activities: readonly Activity[];
  goals: readonly Goal[];
  overrides: CatalogOverrides;
  query: string;
}): SetupView {
  const effectiveGroups = sortCatalogItems(
    groups.map((record) =>
      mergeCatalogOverride({
        record,
        overrides,
        key: catalogKey({ kind: "group", id: record.id }),
      }),
    ),
  );
  const effectiveActivities = sortCatalogItems(
    activities.map((record) =>
      mergeCatalogOverride({
        record,
        overrides,
        key: catalogKey({ kind: "activity", id: record.id }),
      }),
    ),
  );
  const effectiveGoals = sortCatalogItems(
    goals.map((record) =>
      mergeCatalogOverride({
        record,
        overrides,
        key: catalogKey({ kind: "goal", id: record.id }),
      }),
    ),
  );
  const trimmed = query.trim();
  return {
    groups: effectiveGroups,
    activities: effectiveActivities,
    goals: effectiveGoals,
    groupedActivities: filterActivityGroups({
      groups: effectiveGroups,
      activities: effectiveActivities,
      query: trimmed,
      includeArchived: true,
      includeEmpty: !trimmed,
    }),
    activeGroupCount: effectiveGroups.filter((group) => !group.archived).length,
    activeActivityCount: effectiveActivities.filter(
      (activity) => !activity.archived,
    ).length,
  };
}
