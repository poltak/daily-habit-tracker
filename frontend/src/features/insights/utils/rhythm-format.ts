import type { Mood } from "@app/common/features/catalog/types";
import type { RhythmBucket } from "@app/common/features/insights/utils/rhythm-types";

const DEFAULT_MOOD_MIN = 1;
const DEFAULT_MOOD_MAX = 5;

export function formatMean(value: number | null): string {
  return value === null ? "No mood data" : value.toFixed(2);
}

export function formatPercent(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(0)}%`;
}

export function formatSpread(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)} activities / logged day`;
}

/** "Jan 5, 2026". */
export function formatRangeDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    return value;
  }
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** The lowest and the highest score that a chart of the mood covers. */
export function moodBounds(moods: readonly Mood[]): {
  min: number;
  max: number;
} {
  const scores = moods
    .map((mood) => mood.score)
    .filter((score) => Number.isFinite(score));
  if (scores.length === 0) {
    return { min: DEFAULT_MOOD_MIN, max: DEFAULT_MOOD_MAX };
  }
  const min = Math.min(DEFAULT_MOOD_MIN, ...scores);
  const max = Math.max(DEFAULT_MOOD_MAX, ...scores);
  return { min, max: min === max ? max + 1 : max };
}

export function moodRatio({
  value,
  min,
  max,
}: {
  value: number | null;
  min: number;
  max: number;
}): number | null {
  if (value === null) {
    return null;
  }
  return Math.max(0, Math.min(1, (value - min) / Math.max(1e-9, max - min)));
}

/** The line through the recorded fraction of the buckets. A bucket without a fraction breaks it. */
export function activityPath({
  buckets,
  left,
  step,
  baseY,
  height,
}: {
  buckets: readonly RhythmBucket[];
  left: number;
  step: number;
  baseY: number;
  height: number;
}): string {
  let path = "";
  let open = false;
  buckets.forEach((bucket, index) => {
    const fraction = bucket.activityFrequency?.fraction ?? null;
    if (fraction === null) {
      open = false;
      return;
    }
    const x = left + step * (index + 0.5);
    const y = baseY - Math.max(0, Math.min(1, fraction)) * height;
    path += `${open ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)} `;
    open = true;
  });
  return path.trim();
}

/** The bucket with the best mean mood. A tie goes to the lower key. */
export function strongestBucket(
  buckets: readonly RhythmBucket[],
): RhythmBucket | null {
  return (
    [...buckets]
      .filter((bucket) => bucket.mean !== null)
      .toSorted(
        (a, b) =>
          (b.mean ?? -Infinity) - (a.mean ?? -Infinity) ||
          a.key.localeCompare(b.key),
      )[0] ?? null
  );
}
