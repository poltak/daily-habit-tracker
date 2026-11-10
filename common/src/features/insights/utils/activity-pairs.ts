import type { Activity, Mood } from "../../catalog/types.js";
import type { InsightsDay } from "../types.js";
import {
  observationThreshold,
  summaryFromMoodCounts,
  summaryWithSample,
  DEFAULT_MIN_OBSERVATIONS,
} from "./mood-cohorts.js";
import {
  ACTIVITY_PAIR_GROUPS,
  type ActivityPairComparison,
  type ActivityPairGroup,
  type ActivityPairOptions,
  type RelationshipMoodSummary,
} from "./relationship-types.js";

type MoodCounts = Map<string, number>;

function pairKey(activityAId: string, activityBId: string): string {
  return [activityAId, activityBId].toSorted().join("::");
}

function pairMeanRange(
  groups: Record<ActivityPairGroup, RelationshipMoodSummary>,
): number | null {
  const means = ACTIVITY_PAIR_GROUPS.map((group) => groups[group].mean).filter(
    (mean): mean is number => mean !== null,
  );
  return means.length < 2 ? null : Math.max(...means) - Math.min(...means);
}

function describePair({
  activityAId,
  activityBId,
  groups,
  threshold,
}: {
  activityAId: string;
  activityBId: string;
  groups: Record<ActivityPairGroup, RelationshipMoodSummary>;
  threshold: number;
}): ActivityPairComparison {
  const sampleSizes = {
    neither: groups.neither.sampleSize,
    aOnly: groups.aOnly.sampleSize,
    bOnly: groups.bOnly.sampleSize,
    both: groups.both.sampleSize,
  };
  const sparseGroups = ACTIVITY_PAIR_GROUPS.filter(
    (group) => sampleSizes[group] < threshold,
  );
  return {
    pairKey: pairKey(activityAId, activityBId),
    activityAId,
    activityBId,
    groups,
    sampleSizes,
    minObservations: threshold,
    adequate: sparseGroups.length === 0,
    sparseGroups,
    meanRange: pairMeanRange(groups),
  };
}

/** Build the four mood cohorts for a selected activity pair. */
export function compareActivityPair({
  days,
  moods,
  activityAId,
  activityBId,
  minObservations = DEFAULT_MIN_OBSERVATIONS,
}: {
  days: readonly InsightsDay[];
  moods: readonly Mood[];
  activityAId: string;
  activityBId: string;
  minObservations?: number;
}): ActivityPairComparison {
  const buckets: Record<ActivityPairGroup, InsightsDay[]> = {
    neither: [],
    aOnly: [],
    bOnly: [],
    both: [],
  };
  for (const day of days) {
    const hasA = day.activityIds.includes(activityAId);
    const hasB = day.activityIds.includes(activityBId);
    const group: ActivityPairGroup =
      hasA && hasB ? "both" : hasA ? "aOnly" : hasB ? "bOnly" : "neither";
    buckets[group].push(day);
  }
  return describePair({
    activityAId,
    activityBId,
    groups: {
      neither: summaryWithSample(buckets.neither, moods),
      aOnly: summaryWithSample(buckets.aOnly, moods),
      bOnly: summaryWithSample(buckets.bOnly, moods),
      both: summaryWithSample(buckets.both, moods),
    },
    threshold: observationThreshold(minObservations),
  });
}

function increment(counts: MoodCounts, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function subtractCounts(a: MoodCounts, b: MoodCounts): MoodCounts {
  const result: MoodCounts = new Map();
  for (const moodId of new Set([...a.keys(), ...b.keys()])) {
    const value = (a.get(moodId) ?? 0) - (b.get(moodId) ?? 0);
    if (value > 0) {
      result.set(moodId, value);
    }
  }
  return result;
}

function neitherCounts({
  total,
  a,
  b,
  both,
}: {
  total: MoodCounts;
  a: MoodCounts;
  b: MoodCounts;
  both: MoodCounts;
}): MoodCounts {
  const result: MoodCounts = new Map();
  const moodIds = new Set([
    ...total.keys(),
    ...a.keys(),
    ...b.keys(),
    ...both.keys(),
  ]);
  for (const moodId of moodIds) {
    const value =
      (total.get(moodId) ?? 0) -
      (a.get(moodId) ?? 0) -
      (b.get(moodId) ?? 0) +
      (both.get(moodId) ?? 0);
    if (value > 0) {
      result.set(moodId, value);
    }
  }
  return result;
}

/**
 * Build all unique activity pairs. `suggestions` contains only pairs with an
 * adequate mood sample in each of neither/A-only/B-only/both; `comparisons`
 * retains sparse pairs for deliberate manual exploration.
 */
export function rankActivityPairs({
  days,
  moods,
  activities,
  minObservations = DEFAULT_MIN_OBSERVATIONS,
  limit,
}: {
  days: readonly InsightsDay[];
  moods: readonly Mood[];
  activities: readonly Pick<Activity, "id">[];
} & ActivityPairOptions): {
  comparisons: ActivityPairComparison[];
  suggestions: ActivityPairComparison[];
} {
  const activityIdSet = new Set(activities.map((activity) => activity.id));
  const moodCatalog = new Map(moods.map((mood) => [mood.id, mood]));
  const totalByMood: MoodCounts = new Map();
  const activityMoodCounts = new Map<string, MoodCounts>();
  const bothMoodCounts = new Map<string, MoodCounts>();
  const countsOf = (counts: Map<string, MoodCounts>, key: string) => {
    const existing = counts.get(key);
    if (existing) {
      return existing;
    }
    const created: MoodCounts = new Map();
    counts.set(key, created);
    return created;
  };

  // Count each mood and co-occurring activity set once. Pair groups are then
  // derived from totals, per-activity counts, and co-occurrence counts.
  for (const day of days) {
    const mood = moodCatalog.get(day.moodId);
    if (!mood || !Number.isFinite(mood.score)) {
      continue;
    }
    increment(totalByMood, mood.id);
    const dayActivities = [...new Set(day.activityIds)].filter((id) =>
      activityIdSet.has(id),
    );
    for (const activityId of dayActivities) {
      increment(countsOf(activityMoodCounts, activityId), mood.id);
    }
    for (let index = 0; index < dayActivities.length; index += 1) {
      for (
        let nextIndex = index + 1;
        nextIndex < dayActivities.length;
        nextIndex += 1
      ) {
        const key = pairKey(
          dayActivities[index] ?? "",
          dayActivities[nextIndex] ?? "",
        );
        increment(countsOf(bothMoodCounts, key), mood.id);
      }
    }
  }

  const threshold = observationThreshold(minObservations);
  const comparisons: ActivityPairComparison[] = [];
  for (let index = 0; index < activities.length; index += 1) {
    for (
      let nextIndex = index + 1;
      nextIndex < activities.length;
      nextIndex += 1
    ) {
      const activityAId = activities[index]?.id ?? "";
      const activityBId = activities[nextIndex]?.id ?? "";
      const a = activityMoodCounts.get(activityAId) ?? new Map();
      const b = activityMoodCounts.get(activityBId) ?? new Map();
      const both =
        bothMoodCounts.get(pairKey(activityAId, activityBId)) ?? new Map();
      comparisons.push(
        describePair({
          activityAId,
          activityBId,
          groups: {
            neither: summaryFromMoodCounts(
              neitherCounts({ total: totalByMood, a, b, both }),
              moods,
            ),
            aOnly: summaryFromMoodCounts(subtractCounts(a, both), moods),
            bOnly: summaryFromMoodCounts(subtractCounts(b, both), moods),
            both: summaryFromMoodCounts(both, moods),
          },
          threshold,
        }),
      );
    }
  }
  const ranked = comparisons.toSorted((a, b) => {
    if (a.meanRange === null && b.meanRange !== null) {
      return 1;
    }
    if (a.meanRange !== null && b.meanRange === null) {
      return -1;
    }
    if (
      a.meanRange !== null &&
      b.meanRange !== null &&
      a.meanRange !== b.meanRange
    ) {
      return b.meanRange - a.meanRange;
    }
    return a.pairKey.localeCompare(b.pairKey);
  });
  const eligible = ranked.filter((comparison) => comparison.adequate);
  return {
    comparisons: ranked,
    suggestions:
      limit === undefined
        ? eligible
        : eligible.slice(0, Math.max(0, Math.floor(limit))),
  };
}
