import type {
  Activity,
  ActivityGroup,
  Mood,
} from "@app/common/features/catalog/types";
import type { InsightsDay } from "@app/common/features/insights/types";
import {
  compareActivityCalendarDays,
  compareActivityMood,
  rankActivityMoodAssociations,
} from "@app/common/features/insights/utils/activity-associations";
import {
  compareActivityPair,
  rankActivityPairs,
} from "@app/common/features/insights/utils/activity-pairs";
import type {
  ActivityCalendarComparison,
  ActivityMoodAssociation,
  ActivityPairComparison,
} from "@app/common/features/insights/utils/relationship-types";

/** What the owner picked in the sections about activities. A value that does not fit the days is replaced. */
export interface RelationshipChoices {
  /** A year, or `all`. */
  year: string;
  /** A weekday number (0 is Sunday), or `all`. */
  weekday: string;
  activityId: string;
  pairActivityAId: string;
  pairActivityBId: string;
}

export interface RelationshipView {
  /** The activities to choose from, in the order of the groups. */
  activities: Activity[];
  years: string[];
  year: string;
  activityId: string;
  associations: ActivityMoodAssociation[];
  selectedAssociation: ActivityMoodAssociation | undefined;
  calendarComparison: ActivityCalendarComparison | null;
  suggestions: ActivityPairComparison[];
  pairActivityAId: string;
  pairActivityBId: string;
  selectedPair: ActivityPairComparison | null;
}

/** The activities of the days, and the ones that are not archived, in the order of the groups. */
function sortActivities({
  groups,
  activities,
  days,
}: {
  groups: readonly ActivityGroup[];
  activities: readonly Activity[];
  days: readonly InsightsDay[];
}): Activity[] {
  const groupOrder = new Map(
    groups.map((group) => [group.id, group.sortOrder]),
  );
  const observedIds = new Set(days.flatMap((day) => day.activityIds));
  const source = activities.filter(
    (activity) => !activity.archived || observedIds.has(activity.id),
  );
  return [...(source.length ? source : activities)].toSorted((a, b) => {
    const groupDifference =
      (groupOrder.get(a.groupId) ?? Number.MAX_SAFE_INTEGER) -
      (groupOrder.get(b.groupId) ?? Number.MAX_SAFE_INTEGER);
    return (
      groupDifference ||
      a.sortOrder - b.sortOrder ||
      a.name.localeCompare(b.name)
    );
  });
}

export function buildRelationshipView({
  days,
  moods,
  activities,
  groups,
  choices,
}: {
  days: readonly InsightsDay[];
  moods: readonly Mood[];
  activities: readonly Activity[];
  groups: readonly ActivityGroup[];
  choices: RelationshipChoices;
}): RelationshipView {
  const visible = sortActivities({ groups, activities, days });
  const firstId = visible[0]?.id ?? "";
  const activityId =
    visible.find((activity) => activity.id === choices.activityId)?.id ??
    firstId;
  const years = [
    ...new Set(
      days
        .map((day) => day.logicalDate.slice(0, 4))
        .filter((value) => /^\d{4}$/.test(value)),
    ),
  ].toSorted((a, b) => b.localeCompare(a));
  const year =
    choices.year === "all" || years.includes(choices.year)
      ? choices.year
      : "all";
  const associations = rankActivityMoodAssociations({
    days,
    moods,
    activities: visible,
    filter: {
      year: year === "all" ? null : Number(year),
      weekday: choices.weekday === "all" ? null : Number(choices.weekday),
    },
  });
  const pairs = rankActivityPairs({
    days,
    moods,
    activities: visible,
    minObservations: 10,
    limit: 5,
  });
  const fallbackPair = pairs.suggestions[0] ?? pairs.comparisons[0];
  const pairActivityAId = visible.some(
    (activity) => activity.id === choices.pairActivityAId,
  )
    ? choices.pairActivityAId
    : (fallbackPair?.activityAId ?? firstId);
  const pairActivityBId = visible.some(
    (activity) =>
      activity.id === choices.pairActivityBId &&
      activity.id !== pairActivityAId,
  )
    ? choices.pairActivityBId
    : fallbackPair && fallbackPair.activityAId === pairActivityAId
      ? fallbackPair.activityBId
      : (visible.find((activity) => activity.id !== pairActivityAId)?.id ?? "");
  return {
    activities: visible,
    years,
    year,
    activityId,
    associations,
    selectedAssociation:
      associations.find(
        (association) => association.activityId === activityId,
      ) ??
      (activityId
        ? compareActivityMood({ days: [], moods, activityId })
        : undefined),
    calendarComparison: activityId
      ? compareActivityCalendarDays({ days, moods, activityId })
      : null,
    suggestions: pairs.suggestions,
    pairActivityAId,
    pairActivityBId,
    selectedPair:
      pairActivityAId && pairActivityBId
        ? compareActivityPair({
            days,
            moods,
            activityAId: pairActivityAId,
            activityBId: pairActivityBId,
            minObservations: 10,
          })
        : null,
  };
}
