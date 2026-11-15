import type { Activity, Mood } from "../../catalog/types.js";
import {
  addDays,
  dayOfWeek,
  isLogicalDate,
} from "../../core/utils/logical-date.js";
import type { InsightsDay } from "../types.js";
import {
  DEFAULT_MIN_OBSERVATIONS,
  difference,
  summaryWithSample,
} from "./mood-cohorts.js";
import {
  ACTIVITY_CALENDAR_OFFSETS,
  type ActivityCalendarComparison,
  type ActivityCalendarOffset,
  type ActivityMoodAssociation,
  type RelationshipDayFilter,
} from "./relationship-types.js";

const OFFSET_LABELS: Record<ActivityCalendarOffset, string> = {
  "-1": "Previous calendar day",
  "0": "Same calendar day",
  "1": "Next calendar day",
  "2": "+2 calendar days",
};

/**
 * Apply local year and weekday filters without changing the caller's day list.
 * The weekday is computed from the logical date in UTC so it is stable across
 * browsers and does not accidentally move when a device timezone changes.
 */
function filterRelationshipDays(
  days: readonly InsightsDay[],
  filter: RelationshipDayFilter,
): InsightsDay[] {
  return days.filter((day) => {
    if (!isLogicalDate(day.logicalDate)) {
      return false;
    }
    if (
      filter.year !== undefined &&
      filter.year !== null &&
      Number(day.logicalDate.slice(0, 4)) !== filter.year
    ) {
      return false;
    }
    return (
      filter.weekday === undefined ||
      filter.weekday === null ||
      dayOfWeek(day.logicalDate) === filter.weekday
    );
  });
}

function associationForActivity({
  days,
  moods,
  activityId,
}: {
  days: readonly InsightsDay[];
  moods: readonly Mood[];
  activityId: string;
}): ActivityMoodAssociation {
  const recordedDays: InsightsDay[] = [];
  const notRecordedDays: InsightsDay[] = [];
  for (const day of days) {
    if (day.activityIds.includes(activityId)) {
      recordedDays.push(day);
    } else {
      notRecordedDays.push(day);
    }
  }
  const recorded = summaryWithSample(recordedDays, moods);
  const notRecorded = summaryWithSample(notRecordedDays, moods);
  const meanDifference = difference(recorded.mean, notRecorded.mean);
  const goodRateDifference = difference(
    recorded.goodRate,
    notRecorded.goodRate,
  );
  const sparseGroups = [
    ...(recorded.sampleSize < DEFAULT_MIN_OBSERVATIONS
      ? ["recorded" as const]
      : []),
    ...(notRecorded.sampleSize < DEFAULT_MIN_OBSERVATIONS
      ? ["notRecorded" as const]
      : []),
  ];
  return {
    activityId,
    recorded,
    notRecorded,
    meanDifference,
    goodRateDifference,
    associationScore: meanDifference ?? goodRateDifference,
    sparse: sparseGroups.length > 0,
    sparseGroups,
  };
}

/**
 * Rank activities by the difference in average mood on days where the
 * activity was recorded versus days where it was not recorded. This is a
 * descriptive association and does not imply that the activity caused a mood.
 */
export function rankActivityMoodAssociations({
  days,
  moods,
  activities,
  filter = {},
}: {
  days: readonly InsightsDay[];
  moods: readonly Mood[];
  activities: readonly Pick<Activity, "id">[];
  filter?: RelationshipDayFilter;
}): ActivityMoodAssociation[] {
  const filteredDays = filterRelationshipDays(days, filter);
  const associations = activities
    .map((activity) =>
      associationForActivity({
        days: filteredDays,
        moods,
        activityId: activity.id,
      }),
    )
    .filter(
      (association) =>
        association.recorded.sampleSize > 0 ||
        association.notRecorded.sampleSize > 0,
    );
  return associations.toSorted((a, b) => {
    const scoreA = a.associationScore;
    const scoreB = b.associationScore;
    if (scoreA === null && scoreB !== null) {
      return 1;
    }
    if (scoreA !== null && scoreB === null) {
      return -1;
    }
    if (scoreA !== null && scoreB !== null && scoreA !== scoreB) {
      return scoreB - scoreA;
    }
    if (a.recorded.sampleSize !== b.recorded.sampleSize) {
      return b.recorded.sampleSize - a.recorded.sampleSize;
    }
    return a.activityId.localeCompare(b.activityId);
  });
}

/** One activity association, for an activity that the ranking left out. */
export function compareActivityMood({
  days,
  moods,
  activityId,
}: {
  days: readonly InsightsDay[];
  moods: readonly Mood[];
  activityId: string;
}): ActivityMoodAssociation {
  return associationForActivity({ days, moods, activityId });
}

/**
 * Compare exact calendar offsets around anchor days. A missing logical date is
 * omitted from that offset; the implementation never advances to the next
 * available row in the input.
 */
export function compareActivityCalendarDays({
  days,
  moods,
  activityId,
}: {
  days: readonly InsightsDay[];
  moods: readonly Mood[];
  activityId: string;
}): ActivityCalendarComparison {
  const anchors = days.filter((day) => isLogicalDate(day.logicalDate));
  const byDate = new Map(anchors.map((day) => [day.logicalDate, day]));
  const recordedAnchors = anchors.filter((day) =>
    day.activityIds.includes(activityId),
  );
  const notRecordedAnchors = anchors.filter(
    (day) => !day.activityIds.includes(activityId),
  );
  const targetsOf = (cohort: InsightsDay[], offset: number): InsightsDay[] =>
    cohort.flatMap((anchor) => {
      const target = byDate.get(addDays(anchor.logicalDate, offset));
      return target ? [target] : [];
    });
  return {
    activityId,
    anchorCounts: {
      recorded: recordedAnchors.length,
      notRecorded: notRecordedAnchors.length,
    },
    offsets: ACTIVITY_CALENDAR_OFFSETS.map((offset) => ({
      offset,
      label: OFFSET_LABELS[offset],
      recorded: summaryWithSample(targetsOf(recordedAnchors, offset), moods),
      notRecorded: summaryWithSample(
        targetsOf(notRecordedAnchors, offset),
        moods,
      ),
    })),
  };
}
