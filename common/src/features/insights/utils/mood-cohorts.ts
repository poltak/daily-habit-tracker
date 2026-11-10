import type { Mood } from "../../catalog/types.js";
import type { InsightsDay } from "../types.js";
import type { RelationshipMoodSummary } from "./relationship-types.js";
import { summarizeMood } from "./summarize-mood.js";

/** A group with fewer known moods than this is sparse. */
export const DEFAULT_MIN_OBSERVATIONS = 10;

export function summaryWithSample(
  days: readonly InsightsDay[],
  moods: readonly Mood[],
): RelationshipMoodSummary {
  const summary = summarizeMood(days, moods);
  return { ...summary, sampleSize: summary.count };
}

export function summaryFromMoodCounts(
  counts: Map<string, number>,
  moods: readonly Mood[],
): RelationshipMoodSummary {
  const knownMoods = moods.filter((mood) => Number.isFinite(mood.score));
  const distribution = [...knownMoods]
    .toSorted((a, b) => a.score - b.score)
    .map((mood) => ({ moodId: mood.id, count: counts.get(mood.id) ?? 0 }));
  const count = distribution.reduce((total, item) => total + item.count, 0);
  const scores = new Map(knownMoods.map((mood) => [mood.id, mood.score]));
  const total = distribution.reduce(
    (sum, item) => sum + (scores.get(item.moodId) ?? 0) * item.count,
    0,
  );
  const good = distribution.reduce(
    (sum, item) => sum + ((scores.get(item.moodId) ?? 0) >= 4 ? item.count : 0),
    0,
  );
  return {
    count,
    mean: count ? total / count : null,
    goodRate: count ? good / count : null,
    distribution,
    sampleSize: count,
  };
}

export function difference(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : a - b;
}

/** The threshold as a whole number of at least 1, or the default for a value that is not a number. */
export function observationThreshold(minObservations: number): number {
  return Number.isFinite(minObservations)
    ? Math.max(1, Math.floor(minObservations))
    : DEFAULT_MIN_OBSERVATIONS;
}
