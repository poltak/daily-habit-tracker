import type { Activity, Mood } from "./daylio.ts";
import { summarizeMood, type InsightsDay } from "./insights.ts";

/** The offsets used by the calendar-day relationship view. */
export const ACTIVITY_CALENDAR_OFFSETS = [-1, 0, 1, 2] as const;
export type ActivityCalendarOffset = (typeof ACTIVITY_CALENDAR_OFFSETS)[number];

export type RelationshipDayFilter = {
  /** Calendar year, or null/undefined for all years. */
  year?: number | null;
  /** JavaScript calendar weekday (0 = Sunday), or null/undefined for all weekdays. */
  weekday?: number | null;
};

export type MoodSummary = ReturnType<typeof summarizeMood>;

export type RelationshipMoodSummary = MoodSummary & {
  /** Number of days with a known mood in this group. */
  sampleSize: number;
};

export type ActivityMoodAssociation = {
  activityId: string;
  recorded: RelationshipMoodSummary;
  notRecorded: RelationshipMoodSummary;
  /** Aliases that make the two cohorts easier to consume at call sites. */
  withActivity: RelationshipMoodSummary;
  withoutActivity: RelationshipMoodSummary;
  meanDifference: number | null;
  goodRateDifference: number | null;
  /** The mean difference used for descending ranking when it is available. */
  associationScore: number | null;
  /** A deliberately visible signal that one side has a small mood sample. */
  sparse: boolean;
  sparseGroups: ("recorded" | "notRecorded")[];
};

export type ActivityCalendarOffsetComparison = {
  offset: ActivityCalendarOffset;
  label: string;
  recorded: RelationshipMoodSummary;
  notRecorded: RelationshipMoodSummary;
  /** Exact target dates represented in each cohort. */
  recordedDates: string[];
  notRecordedDates: string[];
};

export type ActivityCalendarComparison = {
  activityId: string;
  /** Number of anchor days in each cohort, including days without a mood. */
  anchorCounts: {
    recorded: number;
    notRecorded: number;
  };
  offsets: ActivityCalendarOffsetComparison[];
};

export const ACTIVITY_PAIR_GROUPS = ["neither", "aOnly", "bOnly", "both"] as const;
export type ActivityPairGroup = (typeof ACTIVITY_PAIR_GROUPS)[number];

export type ActivityPairComparison = {
  pairKey: string;
  activityAId: string;
  activityBId: string;
  groups: Record<ActivityPairGroup, RelationshipMoodSummary>;
  /** Same values as the group sample sizes, exposed for chart/table consumers. */
  sampleSizes: Record<ActivityPairGroup, number>;
  minObservations: number;
  adequate: boolean;
  sparseGroups: ActivityPairGroup[];
  /** Difference between the highest and lowest available group mean. */
  meanRange: number | null;
};

export type ActivityPairOptions = {
  /** Suggestions require this many known-mood observations in every group. */
  minObservations?: number;
  /** Optional maximum number of eligible suggestions returned by the ranking helper. */
  limit?: number;
};

const OFFSET_LABELS: Record<ActivityCalendarOffset, string> = {
  "-1": "Previous calendar day",
  "0": "Same calendar day",
  "1": "Next calendar day",
  "2": "+2 calendar days",
};

function validLogicalDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function dateParts(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

function addCalendarDays(value: string, amount: number) {
  if (!validLogicalDate(value)) return null;
  const parts = dateParts(value);
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount));
  const result = date.toISOString().slice(0, 10);
  return validLogicalDate(result) ? result : null;
}

function weekdayFor(value: string) {
  if (!validLogicalDate(value)) return null;
  const parts = dateParts(value);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

function summaryWithSample(days: InsightsDay[], moods: Mood[]): RelationshipMoodSummary {
  const summary = summarizeMood(days, moods);
  return { ...summary, sampleSize: summary.count };
}

function summaryFromMoodCounts(counts: Map<string, number>, moods: Mood[]): RelationshipMoodSummary {
  const knownMoods = [...moods].filter((mood) => Number.isFinite(mood.score));
  const distribution = [...knownMoods].sort((a, b) => a.score - b.score).map((mood) => ({ moodId: mood.id, count: counts.get(mood.id) ?? 0 }));
  const count = distribution.reduce((total, item) => total + item.count, 0);
  const scores = new Map(knownMoods.map((mood) => [mood.id, mood.score]));
  const total = distribution.reduce((sum, item) => sum + (scores.get(item.moodId) ?? 0) * item.count, 0);
  const good = distribution.reduce((sum, item) => sum + ((scores.get(item.moodId) ?? 0) >= 4 ? item.count : 0), 0);
  return { count, mean: count ? total / count : null, goodRate: count ? good / count : null, distribution, sampleSize: count };
}

function difference(a: number | null, b: number | null) {
  return a === null || b === null ? null : a - b;
}

function emptyGroupSummaries(moods: Mood[]): Record<ActivityPairGroup, RelationshipMoodSummary> {
  const empty = summaryWithSample([], moods);
  return {
    neither: { ...empty, distribution: [...empty.distribution] },
    aOnly: { ...empty, distribution: [...empty.distribution] },
    bOnly: { ...empty, distribution: [...empty.distribution] },
    both: { ...empty, distribution: [...empty.distribution] },
  };
}

/**
 * Apply local year and weekday filters without changing the caller's day list.
 * The weekday is computed from the logical date in UTC so it is stable across
 * browsers and does not accidentally move when a device timezone changes.
 */
export function filterRelationshipDays(days: readonly InsightsDay[], filter: RelationshipDayFilter = {}) {
  return days.filter((day) => {
    if (!validLogicalDate(day.logicalDate)) return false;
    if (filter.year !== undefined && filter.year !== null && Number(day.logicalDate.slice(0, 4)) !== filter.year) return false;
    if (filter.weekday !== undefined && filter.weekday !== null && weekdayFor(day.logicalDate) !== filter.weekday) return false;
    return true;
  });
}

function associationForActivity({ days, moods, activityId, minObservations = 10 }: { days: readonly InsightsDay[]; moods: Mood[]; activityId: string; minObservations?: number }): ActivityMoodAssociation {
  const recordedDays: InsightsDay[] = [];
  const notRecordedDays: InsightsDay[] = [];
  for (const day of days) {
    if (day.activityIds.includes(activityId)) recordedDays.push(day);
    else notRecordedDays.push(day);
  }
  const recorded = summaryWithSample(recordedDays, moods);
  const notRecorded = summaryWithSample(notRecordedDays, moods);
  const meanDifference = difference(recorded.mean, notRecorded.mean);
  const goodRateDifference = difference(recorded.goodRate, notRecorded.goodRate);
  const threshold = Number.isFinite(minObservations) ? Math.max(1, Math.floor(minObservations)) : 10;
  const sparseGroups = [
    ...(recorded.sampleSize < threshold ? ["recorded" as const] : []),
    ...(notRecorded.sampleSize < threshold ? ["notRecorded" as const] : []),
  ];
  return {
    activityId,
    recorded,
    notRecorded,
    withActivity: recorded,
    withoutActivity: notRecorded,
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
  moods: Mood[];
  activities: readonly Pick<Activity, "id">[];
  filter?: RelationshipDayFilter;
}) {
  const filteredDays = filterRelationshipDays(days, filter);
  const associations = activities
    .map((activity) => associationForActivity({ days: filteredDays, moods, activityId: activity.id }))
    .filter((association) => association.recorded.sampleSize > 0 || association.notRecorded.sampleSize > 0);
  return associations.sort((a, b) => {
    const scoreA = a.associationScore;
    const scoreB = b.associationScore;
    if (scoreA === null && scoreB !== null) return 1;
    if (scoreA !== null && scoreB === null) return -1;
    if (scoreA !== null && scoreB !== null && scoreA !== scoreB) return scoreB - scoreA;
    if (a.recorded.sampleSize !== b.recorded.sampleSize) return b.recorded.sampleSize - a.recorded.sampleSize;
    return a.activityId.localeCompare(b.activityId);
  });
}

/** Return one activity association, useful when the UI has a selected activity. */
export function compareActivityMood({
  days,
  moods,
  activityId,
  filter = {},
}: {
  days: readonly InsightsDay[];
  moods: Mood[];
  activityId: string;
  filter?: RelationshipDayFilter;
}) {
  return associationForActivity({ days: filterRelationshipDays(days, filter), moods, activityId });
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
  anchorFilter = {},
}: {
  days: readonly InsightsDay[];
  moods: Mood[];
  activityId: string;
  anchorFilter?: RelationshipDayFilter;
}): ActivityCalendarComparison {
  const anchors = filterRelationshipDays(days, anchorFilter);
  const byDate = new Map<string, InsightsDay>();
  for (const day of days) {
    if (validLogicalDate(day.logicalDate)) byDate.set(day.logicalDate, day);
  }
  const recordedAnchors = anchors.filter((day) => day.activityIds.includes(activityId));
  const notRecordedAnchors = anchors.filter((day) => !day.activityIds.includes(activityId));
  const offsets = ACTIVITY_CALENDAR_OFFSETS.map((offset) => {
    const recordedDays: InsightsDay[] = [];
    const notRecordedDays: InsightsDay[] = [];
    const recordedDates: string[] = [];
    const notRecordedDates: string[] = [];
    for (const anchor of recordedAnchors) {
      const targetDate = addCalendarDays(anchor.logicalDate, offset);
      const target = targetDate ? byDate.get(targetDate) : undefined;
      if (target) {
        recordedDays.push(target);
        recordedDates.push(target.logicalDate);
      }
    }
    for (const anchor of notRecordedAnchors) {
      const targetDate = addCalendarDays(anchor.logicalDate, offset);
      const target = targetDate ? byDate.get(targetDate) : undefined;
      if (target) {
        notRecordedDays.push(target);
        notRecordedDates.push(target.logicalDate);
      }
    }
    return {
      offset,
      label: OFFSET_LABELS[offset],
      recorded: summaryWithSample(recordedDays, moods),
      notRecorded: summaryWithSample(notRecordedDays, moods),
      recordedDates,
      notRecordedDates,
    };
  });
  return {
    activityId,
    anchorCounts: { recorded: recordedAnchors.length, notRecorded: notRecordedAnchors.length },
    offsets,
  };
}

/** Alias with a shorter name for consumers that already use “window” terminology. */
export const compareActivityWindow = compareActivityCalendarDays;

function pairKey(activityAId: string, activityBId: string) {
  return [activityAId, activityBId].sort().join("::");
}

function pairMeanRange(groups: Record<ActivityPairGroup, RelationshipMoodSummary>) {
  const means = ACTIVITY_PAIR_GROUPS.map((group) => groups[group].mean).filter((mean): mean is number => mean !== null);
  return means.length < 2 ? null : Math.max(...means) - Math.min(...means);
}

/** Build the four mood cohorts for a selected activity pair. */
export function compareActivityPair({
  days,
  moods,
  activityAId,
  activityBId,
  minObservations = 10,
}: {
  days: readonly InsightsDay[];
  moods: Mood[];
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
    const group: ActivityPairGroup = hasA && hasB ? "both" : hasA ? "aOnly" : hasB ? "bOnly" : "neither";
    buckets[group].push(day);
  }
  const groups = emptyGroupSummaries(moods);
  for (const group of ACTIVITY_PAIR_GROUPS) groups[group] = summaryWithSample(buckets[group], moods);
  const threshold = Number.isFinite(minObservations) ? Math.max(1, Math.floor(minObservations)) : 10;
  const sampleSizes = Object.fromEntries(ACTIVITY_PAIR_GROUPS.map((group) => [group, groups[group].sampleSize])) as Record<ActivityPairGroup, number>;
  const sparseGroups = ACTIVITY_PAIR_GROUPS.filter((group) => sampleSizes[group] < threshold);
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

/**
 * Build all unique activity pairs. `suggestions` contains only pairs with an
 * adequate mood sample in each of neither/A-only/B-only/both; `comparisons`
 * retains sparse pairs for deliberate manual exploration.
 */
export function rankActivityPairs({
  days,
  moods,
  activities,
  minObservations = 10,
  limit,
}: {
  days: readonly InsightsDay[];
  moods: Mood[];
  activities: readonly Pick<Activity, "id">[];
} & ActivityPairOptions) {
  const activityIds = activities.map((activity) => activity.id);
  const activityIdSet = new Set(activityIds);
  const moodCatalog = new Map(moods.map((mood) => [mood.id, mood]));
  const totalByMood = new Map<string, number>();
  const activityMoodCounts = new Map<string, Map<string, number>>();
  const bothMoodCounts = new Map<string, Map<string, number>>();
  const increment = (counts: Map<string, number>, key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);

  // Count each mood and co-occurring activity set once. Pair groups are then
  // derived from totals, per-activity counts, and co-occurrence counts.
  for (const day of days) {
    const mood = moodCatalog.get(day.moodId);
    if (!mood || !Number.isFinite(mood.score)) continue;
    increment(totalByMood, mood.id);
    const dayActivities = [...new Set(day.activityIds)].filter((id) => activityIdSet.has(id));
    for (const activityId of dayActivities) {
      if (!activityMoodCounts.has(activityId)) activityMoodCounts.set(activityId, new Map());
      increment(activityMoodCounts.get(activityId)!, mood.id);
    }
    for (let index = 0; index < dayActivities.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < dayActivities.length; nextIndex += 1) {
        const key = pairKey(dayActivities[index], dayActivities[nextIndex]);
        if (!bothMoodCounts.has(key)) bothMoodCounts.set(key, new Map());
        increment(bothMoodCounts.get(key)!, mood.id);
      }
    }
  }
  const subtractCounts = (a: Map<string, number>, b: Map<string, number>) => {
    const result = new Map<string, number>();
    for (const moodId of new Set([...a.keys(), ...b.keys()])) {
      const value = (a.get(moodId) ?? 0) - (b.get(moodId) ?? 0);
      if (value > 0) result.set(moodId, value);
    }
    return result;
  };
  const neitherCounts = (total: Map<string, number>, a: Map<string, number>, b: Map<string, number>, both: Map<string, number>) => {
    const result = new Map<string, number>();
    for (const moodId of new Set([...total.keys(), ...a.keys(), ...b.keys(), ...both.keys()])) {
      const value = (total.get(moodId) ?? 0) - (a.get(moodId) ?? 0) - (b.get(moodId) ?? 0) + (both.get(moodId) ?? 0);
      if (value > 0) result.set(moodId, value);
    }
    return result;
  };
  const threshold = Number.isFinite(minObservations) ? Math.max(1, Math.floor(minObservations)) : 10;
  const comparisons: ActivityPairComparison[] = [];
  for (let index = 0; index < activities.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < activities.length; nextIndex += 1) {
      const activityAId = activities[index].id;
      const activityBId = activities[nextIndex].id;
      const a = activityMoodCounts.get(activityAId) ?? new Map<string, number>();
      const b = activityMoodCounts.get(activityBId) ?? new Map<string, number>();
      const both = bothMoodCounts.get(pairKey(activityAId, activityBId)) ?? new Map<string, number>();
      const groups: Record<ActivityPairGroup, RelationshipMoodSummary> = {
        neither: summaryFromMoodCounts(neitherCounts(totalByMood, a, b, both), moods),
        aOnly: summaryFromMoodCounts(subtractCounts(a, both), moods),
        bOnly: summaryFromMoodCounts(subtractCounts(b, both), moods),
        both: summaryFromMoodCounts(both, moods),
      };
      const sampleSizes = Object.fromEntries(ACTIVITY_PAIR_GROUPS.map((group) => [group, groups[group].sampleSize])) as Record<ActivityPairGroup, number>;
      const sparseGroups = ACTIVITY_PAIR_GROUPS.filter((group) => sampleSizes[group] < threshold);
      comparisons.push({ pairKey: pairKey(activityAId, activityBId), activityAId, activityBId, groups, sampleSizes, minObservations: threshold, adequate: sparseGroups.length === 0, sparseGroups, meanRange: pairMeanRange(groups) });
    }
  }
  const ranked = [...comparisons].sort((a, b) => {
    if (a.meanRange === null && b.meanRange !== null) return 1;
    if (a.meanRange !== null && b.meanRange === null) return -1;
    if (a.meanRange !== null && b.meanRange !== null && a.meanRange !== b.meanRange) return b.meanRange - a.meanRange;
    return a.pairKey.localeCompare(b.pairKey);
  });
  const eligible = ranked.filter((comparison) => comparison.adequate);
  const suggestions = limit === undefined
    ? eligible
    : eligible.slice(0, Math.max(0, Math.floor(limit)));
  return { comparisons: ranked, suggestions };
}

/** Alias for call sites that prefer an imperative “build” name. */
export const buildActivityPairComparisons = rankActivityPairs;
