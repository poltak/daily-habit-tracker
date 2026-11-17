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

export function difference(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : a - b;
}
