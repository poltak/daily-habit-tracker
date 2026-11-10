import type { Activity, Mood } from "@app/common/features/catalog/types";
import type {
  ActivityPairComparison,
  RelationshipMoodSummary,
} from "@app/common/features/insights/utils/relationship-types";

export function formatMean(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(2)}/5`;
}

function formatRate(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

/** "+1.83 mood points", or "No comparison" when one side has no mood. */
export function formatDifference(value: number | null): string {
  if (value === null) {
    return "No comparison";
  }
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} mood points`;
}

export function displayActivityName(activity: Activity | undefined): string {
  if (!activity) {
    return "Unknown activity";
  }
  return activity.archived ? `${activity.name} (archived)` : activity.name;
}

export function summaryLine(summary: RelationshipMoodSummary): string {
  if (summary.sampleSize === 0) {
    return "No known mood observations";
  }
  return `${summary.sampleSize} ${summary.sampleSize === 1 ? "day" : "days"} · average ${formatMean(summary.mean)} · good mood ${formatRate(summary.goodRate)}`;
}

/** "Good 2 · Rad 1": the moods that the group has. */
export function distributionLine(
  summary: RelationshipMoodSummary,
  moods: readonly Mood[],
): string {
  if (summary.sampleSize === 0) {
    return "No known mood observations";
  }
  const names = new Map(moods.map((mood) => [mood.id, mood.name]));
  return summary.distribution
    .filter((item) => item.count > 0)
    .map((item) => `${names.get(item.moodId) ?? item.moodId} ${item.count}`)
    .join(" · ");
}

export function pairLabel({
  pair,
  activityById,
}: {
  pair: ActivityPairComparison;
  activityById: ReadonlyMap<string, Activity>;
}): string {
  return `${displayActivityName(activityById.get(pair.activityAId))} + ${displayActivityName(activityById.get(pair.activityBId))}`;
}
