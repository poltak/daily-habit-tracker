import type { Activity, ActivityGroup, Mood } from "./daylio.ts";

export type InsightsDay = { logicalDate: string; moodId: string; activityIds: string[] };
export type InsightsData = { moods: Mood[]; activities: Activity[]; groups: ActivityGroup[]; days: InsightsDay[] };
export type MoodSummary = {
  count: number;
  mean: number | null;
  goodRate: number | null;
  distribution: { moodId: string; count: number }[];
};

/** Unknown moods do not contribute a zero score or inflate the denominator. */
export function summarizeMood(days: readonly InsightsDay[], moods: readonly Mood[]): MoodSummary {
  const catalog = new Map(moods.map((mood) => [mood.id, mood]));
  const counts = new Map<string, number>();
  let count = 0;
  let total = 0;
  let good = 0;
  for (const day of days) {
    const mood = catalog.get(day.moodId);
    if (!mood || !Number.isFinite(mood.score)) continue;
    count++;
    total += mood.score;
    if (mood.score >= 4) good++;
    counts.set(mood.id, (counts.get(mood.id) ?? 0) + 1);
  }
  return {
    count,
    mean: count ? total / count : null,
    goodRate: count ? good / count : null,
    distribution: [...moods].sort((a, b) => a.score - b.score).map((mood) => ({ moodId: mood.id, count: counts.get(mood.id) ?? 0 })),
  };
}

export function insightsDateRange(preset: string, asOf: string, firstDate: string) {
  if (preset === "90d" || preset === "1y") {
    const start = new Date(`${asOf}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - (preset === "90d" ? 89 : 364));
    return { startDate: start.toISOString().slice(0, 10), endDate: asOf };
  }
  if (/^\d{4}$/.test(preset)) return { startDate: `${preset}-01-01`, endDate: `${preset}-12-31` < asOf ? `${preset}-12-31` : asOf };
  return { startDate: firstDate <= asOf ? firstDate : asOf, endDate: asOf };
}

export function daysInInsightsRange(startDate: string, endDate: string) {
  return Math.max(0, Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1);
}
