import type { Mood } from "@app/common/features/catalog/types";
import type { RelationshipMoodSummary } from "@app/common/features/insights/utils/relationship-types";
import { MoodFace } from "../../core/ui/mood-face.js";
import {
  distributionLine,
  formatMean,
  summaryLine,
} from "../utils/relationship-format.js";

function MoodDistribution({
  summary,
  moods,
  label,
  compact = false,
}: {
  summary: RelationshipMoodSummary;
  moods: readonly Mood[];
  label: string;
  compact?: boolean;
}) {
  const orderedMoods = [...moods].toSorted((a, b) => a.score - b.score);
  const counts = orderedMoods.map(
    (mood) =>
      summary.distribution.find((item) => item.moodId === mood.id)?.count ?? 0,
  );
  const width = Math.max(220, orderedMoods.length * (compact ? 45 : 54));
  const height = compact ? 94 : 130;
  const chartTop = 9;
  const chartBottom = compact ? 65 : 91;
  const chartHeight = chartBottom - chartTop;
  const slot = (width - 20) / Math.max(1, orderedMoods.length);
  const barWidth = Math.max(16, Math.min(34, slot - 10));
  const percentages = counts.map((count) =>
    summary.sampleSize ? (count / summary.sampleSize) * 100 : 0,
  );
  const chartDescription = orderedMoods
    .map(
      (mood, index) =>
        `${mood.name}: ${counts[index]} (${Math.round(percentages[index] ?? 0)}%)`,
    )
    .join(", ");
  return (
    <div
      className={`insight-rel-distribution ${compact ? "insight-rel-distribution-compact" : ""}`}
    >
      <svg
        className="insight-rel-distribution-chart"
        viewBox={`0 0 ${width} ${height}`}
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- An svg chart gets the image role from this attribute only.
        role="img"
        aria-label={`${label}. ${chartDescription || "No mood observations"}`}
      >
        <title>{label}</title>
        <desc>{chartDescription || "No mood observations"}</desc>
        <line
          x1="10"
          y1={chartBottom + 0.5}
          x2={width - 10}
          y2={chartBottom + 0.5}
          className="insight-rel-chart-axis"
        />
        {orderedMoods.map((mood, index) => {
          const count = counts[index] ?? 0;
          const percentage = percentages[index] ?? 0;
          const barHeight = count
            ? Math.max(2, (percentage / 100) * chartHeight)
            : 0;
          const x = 10 + index * slot + (slot - barWidth) / 2;
          const y = chartBottom - barHeight;
          return (
            <g key={mood.id}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx="5"
                fill={mood.color || "var(--accent)"}
                className="insight-rel-chart-bar"
              >
                <title>{`${mood.name}: ${count} (${Math.round(percentage)}%)`}</title>
              </rect>
              {count > 0 ? (
                <text
                  x={x + barWidth / 2}
                  y={Math.max(8, y - 4)}
                  textAnchor="middle"
                  className="insight-rel-chart-count"
                >
                  {count}
                </text>
              ) : null}
              <MoodFace
                score={mood.score}
                color={mood.color}
                x={x + barWidth / 2 - 7}
                y={chartBottom + 6}
                width={14}
                height={14}
              />
            </g>
          );
        })}
      </svg>
      <div
        className="insights-legend insight-rel-distribution-legend"
        aria-hidden="true"
      >
        {orderedMoods.map((mood) => (
          <span key={mood.id}>
            <i style={{ backgroundColor: mood.color || "var(--accent)" }} />
            {mood.name}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Two bars with the mean mood of the days with and without something. */
export function MeanBars({
  recorded,
  notRecorded,
}: {
  recorded: RelationshipMoodSummary;
  notRecorded: RelationshipMoodSummary;
}) {
  const rows = [
    { label: "Recorded", summary: recorded, key: "recorded" },
    { label: "Not recorded", summary: notRecorded, key: "not-recorded" },
  ];
  return (
    <div className="insight-rel-mean-bars" aria-label="Average mood comparison">
      {rows.map(({ label, summary, key }) => (
        <div className="insight-rel-mean-row" key={key}>
          <span>{label}</span>
          <div className="insight-rel-mean-track" aria-hidden="true">
            <i
              style={{
                width:
                  summary.mean === null
                    ? "0%"
                    : `${Math.max(0, Math.min(100, (summary.mean / 5) * 100))}%`,
              }}
            />
          </div>
          <strong>{formatMean(summary.mean)}</strong>
          <small>n={summary.sampleSize}</small>
        </div>
      ))}
    </div>
  );
}

export function SummaryCard({
  title,
  summary,
  moods,
  compact = false,
}: {
  title: string;
  summary: RelationshipMoodSummary;
  moods: readonly Mood[];
  compact?: boolean;
}) {
  return (
    <article
      className={`insight-rel-summary-card ${summary.sampleSize < 10 ? "insight-rel-summary-sparse" : ""}`}
    >
      <div className="insight-rel-summary-heading">
        <h4>{title}</h4>
        <span>n={summary.sampleSize}</span>
      </div>
      <p className="insight-rel-summary-line">{summaryLine(summary)}</p>
      {summary.sampleSize ? (
        <MoodDistribution
          summary={summary}
          moods={moods}
          label={`${title} mood distribution`}
          compact={compact}
        />
      ) : (
        <p className="insights-empty insight-rel-summary-empty">
          No known mood observations for this group.
        </p>
      )}
      {summary.sampleSize ? (
        <p className="insight-rel-distribution-text">
          {distributionLine(summary, moods)}
        </p>
      ) : null}
    </article>
  );
}
