/** The history that `GET /api/insights` gives, and the numbers computed from it. */
import type { Activity, ActivityGroup, Mood } from "../catalog/types.js";
import type { EffectiveDay } from "../days/types.js";

export type InsightsDay = EffectiveDay;

export interface InsightsData {
  moods: Mood[];
  activities: Activity[];
  groups: ActivityGroup[];
  days: InsightsDay[];
}

export interface MoodSummary {
  /** Days with a known mood. */
  count: number;
  mean: number | null;
  goodRate: number | null;
  distribution: { moodId: string; count: number }[];
}
