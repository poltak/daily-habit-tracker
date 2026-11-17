import type { Activity, Mood } from "../../catalog/types.js";
import type { InsightsDay } from "../types.js";
import {
  DEFAULT_MIN_OBSERVATIONS,
  difference,
  summaryWithSample,
} from "./mood-cohorts.js";
import type { ActivityMoodAssociation } from "./relationship-types.js";

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
}: {
  days: readonly InsightsDay[];
  moods: readonly Mood[];
  activities: readonly Pick<Activity, "id">[];
}): ActivityMoodAssociation[] {
  const associations = activities
    .map((activity) =>
      associationForActivity({
        days,
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
