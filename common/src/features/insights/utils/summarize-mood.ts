import type { Mood } from "../../catalog/types.js";
import type { InsightsDay, MoodSummary } from "../types.js";

/** A score of this value or more is a good mood. */
const GOOD_SCORE = 4;

/** Unknown moods do not contribute a zero score or inflate the denominator. */
export function summarizeMood(
  days: readonly InsightsDay[],
  moods: readonly Mood[],
): MoodSummary {
  const catalog = new Map(moods.map((mood) => [mood.id, mood]));
  const counts = new Map<string, number>();
  let count = 0;
  let total = 0;
  let good = 0;
  for (const day of days) {
    const mood = catalog.get(day.moodId);
    if (!mood || !Number.isFinite(mood.score)) {
      continue;
    }
    count++;
    total += mood.score;
    if (mood.score >= GOOD_SCORE) {
      good++;
    }
    counts.set(mood.id, (counts.get(mood.id) ?? 0) + 1);
  }
  return {
    count,
    mean: count ? total / count : null,
    goodRate: count ? good / count : null,
    distribution: [...moods]
      .toSorted((a, b) => a.score - b.score)
      .map((mood) => ({ moodId: mood.id, count: counts.get(mood.id) ?? 0 })),
  };
}
