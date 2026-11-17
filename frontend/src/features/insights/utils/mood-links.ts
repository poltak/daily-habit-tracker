import type {
  Activity,
  ActivityGroup,
  Mood,
} from "@app/common/features/catalog/types";
import type { InsightsDay } from "@app/common/features/insights/types";
import { rankActivityMoodAssociations } from "@app/common/features/insights/utils/activity-associations";

const FEELINGS_GROUP_NAME = /emotion|feeling|mood/i;
const MOST_SHOWN_PER_SIDE = 6;

/** The fewest days that each side of a comparison needs, for `recordedDays` days. */
export function minDays(recordedDays: number): number {
  return Math.min(10, Math.max(2, Math.floor(recordedDays / 5)));
}

export function findFeelingsGroup(
  groups: readonly ActivityGroup[],
): ActivityGroup | undefined {
  return groups
    .toSorted((a, b) => a.sortOrder - b.sortOrder)
    .find((group) => FEELINGS_GROUP_NAME.test(group.name));
}

/** An archived activity shows only when one of the days has it. */
export function visibleActivities({
  activities,
  days,
}: {
  activities: readonly Activity[];
  days: readonly InsightsDay[];
}): Activity[] {
  const observed = new Set(days.flatMap((day) => day.activityIds));
  return activities.filter(
    (activity) => !activity.archived || observed.has(activity.id),
  );
}

/**
 * The mood on days with each activity, less the mood on days without it, for
 * the activities that have at least `minimum` days on both sides.
 */
export function qualifiedMoodDifferences({
  days,
  moods,
  activities,
  minimum,
}: {
  days: readonly InsightsDay[];
  moods: readonly Mood[];
  activities: readonly Activity[];
  minimum: number;
}): Map<string, { recordedDays: number; difference: number }> {
  const qualified = new Map<
    string,
    { recordedDays: number; difference: number }
  >();
  for (const association of rankActivityMoodAssociations({
    days,
    moods,
    activities,
  })) {
    if (
      association.meanDifference !== null &&
      association.recorded.sampleSize >= minimum &&
      association.notRecorded.sampleSize >= minimum
    ) {
      qualified.set(association.activityId, {
        recordedDays: association.recorded.sampleSize,
        difference: association.meanDifference,
      });
    }
  }
  return qualified;
}

export interface MoodLinkItem {
  activityId: string;
  name: string;
  /** The days with the activity that have a known mood. */
  days: number;
  difference: number;
  /** The bar length from 0 to 1, against the largest difference of both lists. */
  length: number;
}

export interface MoodLinks {
  minDays: number;
  /** The activities outside the feelings group. */
  whatYouDo: MoodLinkItem[];
  /** Null when the journal has no feelings group. */
  howYouFelt: MoodLinkItem[] | null;
}

/** Each list holds the best items first and the worst last. */
export function buildMoodLinks({
  days,
  moods,
  activities,
  groups,
}: {
  days: readonly InsightsDay[];
  moods: readonly Mood[];
  activities: readonly Activity[];
  groups: readonly ActivityGroup[];
}): MoodLinks {
  const minimum = minDays(days.length);
  const feelings = findFeelingsGroup(groups);
  const visible = visibleActivities({ activities, days });
  const qualified = qualifiedMoodDifferences({
    days,
    moods,
    activities: visible,
    minimum,
  });
  const listOf = (inFeelingsGroup: boolean): MoodLinkItem[] => {
    const items = visible
      .filter(
        (activity) => (activity.groupId === feelings?.id) === inFeelingsGroup,
      )
      .flatMap((activity) => {
        const found = qualified.get(activity.id);
        if (!found || found.difference === 0) {
          return [];
        }
        return [
          {
            activityId: activity.id,
            name: activity.archived
              ? `${activity.name} (archived)`
              : activity.name,
            days: found.recordedDays,
            difference: found.difference,
            length: 0,
          },
        ];
      })
      .toSorted(
        (a, b) => b.difference - a.difference || a.name.localeCompare(b.name),
      );
    return [
      ...items
        .filter((item) => item.difference > 0)
        .slice(0, MOST_SHOWN_PER_SIDE),
      ...items
        .filter((item) => item.difference < 0)
        .slice(-MOST_SHOWN_PER_SIDE),
    ];
  };
  const whatYouDo = listOf(false);
  const howYouFelt = feelings ? listOf(true) : null;
  // Both lists sit in one card, so one scale keeps equal differences equal in length.
  const largest = Math.max(
    ...[...whatYouDo, ...(howYouFelt ?? [])].map((item) =>
      Math.abs(item.difference),
    ),
  );
  const scaled = (items: MoodLinkItem[]) =>
    items.map((item) => ({
      ...item,
      length: Math.abs(item.difference) / largest,
    }));
  return {
    minDays: minimum,
    whatYouDo: scaled(whatYouDo),
    howYouFelt: howYouFelt && scaled(howYouFelt),
  };
}
