import type {
  Activity,
  ActivityGroup,
  Mood,
} from "@app/common/features/catalog/types";
import { addDays } from "@app/common/features/core/utils/logical-date";
import type { InsightsDay } from "@app/common/features/insights/types";
import {
  findFeelingsGroup,
  minDays,
  qualifiedMoodDifferences,
  visibleActivities,
} from "./mood-links.js";

const RECENT_DAYS = 90;
const MIN_DAYS_PER_SIDE = 30;
const MIN_SHIFT = 0.1;
const MOST_SHOWN = 6;

interface RecentChangeItem {
  activityId: string;
  name: string;
  /** The share of the earlier days with the activity, from 0 to 1. */
  before: number;
  /** The share of the last 90 days with the activity, from 0 to 1. */
  after: number;
  /** The mood on the recent days with the activity less without it. Null when a side has too few days. */
  moodDifference: number | null;
}

export interface RecentChange {
  /** False when the period lacks days to compare. */
  enough: boolean;
  items: RecentChangeItem[];
}

function shareOf(sample: readonly InsightsDay[], activity: Activity): number {
  return (
    sample.filter((day) => day.activityIds.includes(activity.id)).length /
    sample.length
  );
}

export function buildRecentChange({
  days,
  moods,
  activities,
  groups,
  endDate,
}: {
  days: readonly InsightsDay[];
  moods: readonly Mood[];
  activities: readonly Activity[];
  groups: readonly ActivityGroup[];
  endDate: string;
}): RecentChange {
  const recentStart = addDays(endDate, -(RECENT_DAYS - 1));
  const recent = days.filter((day) => day.logicalDate >= recentStart);
  const earlier = days.filter((day) => day.logicalDate < recentStart);
  if (recent.length < MIN_DAYS_PER_SIDE || earlier.length < MIN_DAYS_PER_SIDE) {
    return { enough: false, items: [] };
  }
  const feelingsId = findFeelingsGroup(groups)?.id;
  const shifts = visibleActivities({ activities, days })
    .filter((activity) => activity.groupId !== feelingsId)
    .map((activity) => ({
      activity,
      before: shareOf(earlier, activity),
      after: shareOf(recent, activity),
    }))
    .filter(({ before, after }) => Math.abs(after - before) >= MIN_SHIFT - 1e-9)
    .toSorted(
      (a, b) =>
        Math.abs(b.after - b.before) - Math.abs(a.after - a.before) ||
        a.activity.name.localeCompare(b.activity.name),
    )
    .slice(0, MOST_SHOWN);
  const moodDifferences = qualifiedMoodDifferences({
    days: recent,
    moods,
    activities: shifts.map(({ activity }) => activity),
    minimum: minDays(recent.length),
  });
  return {
    enough: true,
    items: shifts.map(({ activity, before, after }) => ({
      activityId: activity.id,
      name: activity.archived ? `${activity.name} (archived)` : activity.name,
      before,
      after,
      moodDifference: moodDifferences.get(activity.id)?.difference ?? null,
    })),
  };
}
