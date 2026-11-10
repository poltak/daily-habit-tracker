import type { Mood } from "@app/common/features/catalog/types";
import type { RhythmBucket } from "@app/common/features/insights/utils/rhythm-types";
import {
  activityPath,
  formatMean,
  formatPercent,
  moodBounds,
  moodRatio,
} from "../utils/rhythm-format.js";

/** Bars with the mean mood of each bucket, an optional line for an activity, and a table for screen readers. */
export function RhythmChart({
  title,
  buckets,
  moods,
  overlayActivityName,
}: {
  title: string;
  buckets: readonly RhythmBucket[];
  moods: readonly Mood[];
  overlayActivityName: string | null;
}) {
  const bounds = moodBounds(moods);
  const width = Math.max(600, buckets.length * 92);
  const height = 210;
  const left = 46;
  const right = overlayActivityName ? 56 : 22;
  const top = 24;
  const bottom = 48;
  const plotHeight = height - top - bottom;
  const plotWidth = width - left - right;
  const step = plotWidth / buckets.length;
  const baseline = top + plotHeight;
  const path = overlayActivityName
    ? activityPath({
        buckets,
        left,
        step,
        baseY: baseline,
        height: plotHeight,
      })
    : "";
  const titleId = `${title.replaceAll(" ", "-")}-title`;

  return (
    <figure className="insight-rhythm-chart-card">
      <figcaption className="insight-rhythm-chart-heading">
        <div>
          <h3>{title}</h3>
          <p>Bars show mean mood. Each bucket includes its mood sample size.</p>
        </div>
        <span className="insight-rhythm-chart-range">
          {bounds.min}–{bounds.max} mood scale
        </span>
      </figcaption>
      <div className="insights-chart-scroll insight-rhythm-chart-scroll">
        <svg
          className="insight-rhythm-chart"
          viewBox={`0 0 ${width} ${height}`}
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- An svg chart gets the image role from this attribute only.
          role="img"
          aria-labelledby={titleId}
        >
          <title id={titleId}>{title}</title>
          <desc>
            {overlayActivityName
              ? `Mean mood with ${overlayActivityName} recorded as a fraction of logged days. Missing mood observations are left blank.`
              : "Mean mood by bucket. Missing mood observations are left blank."}
          </desc>
          <line
            className="insight-rhythm-axis"
            x1={left}
            x2={left}
            y1={top}
            y2={baseline}
          />
          <line
            className="insight-rhythm-axis"
            x1={left}
            x2={width - right}
            y1={baseline}
            y2={baseline}
          />
          <text
            className="insight-rhythm-axis-label"
            x={left - 8}
            y={top + 4}
            textAnchor="end"
          >
            {bounds.max}
          </text>
          <text
            className="insight-rhythm-axis-label"
            x={left - 8}
            y={baseline + 4}
            textAnchor="end"
          >
            {bounds.min}
          </text>
          {overlayActivityName ? (
            <>
              <line
                className="insight-rhythm-axis insight-rhythm-axis-activity"
                x1={width - right}
                x2={width - right}
                y1={top}
                y2={baseline}
              />
              <text
                className="insight-rhythm-axis-label insight-rhythm-axis-label-activity"
                x={width - right + 8}
                y={top + 4}
              >
                100%
              </text>
              <text
                className="insight-rhythm-axis-label insight-rhythm-axis-label-activity"
                x={width - right + 8}
                y={baseline + 4}
              >
                0%
              </text>
            </>
          ) : null}
          {buckets.map((bucket, index) => {
            const ratio = moodRatio({
              value: bucket.mean,
              min: bounds.min,
              max: bounds.max,
            });
            const x = left + step * index + step * 0.2;
            const barWidth = step * 0.6;
            const barHeight =
              ratio === null ? 0 : Math.max(2, ratio * plotHeight);
            const barY = baseline - barHeight;
            return (
              <g key={bucket.key}>
                <rect
                  className={
                    ratio === null
                      ? "insight-rhythm-bar insight-rhythm-bar-empty"
                      : "insight-rhythm-bar"
                  }
                  x={x}
                  y={ratio === null ? baseline - 2 : barY}
                  width={barWidth}
                  height={ratio === null ? 2 : barHeight}
                  rx="5"
                >
                  <title>{`${bucket.label}: ${formatMean(bucket.mean)}; ${bucket.count} mood observations; ${bucket.loggedCount} logged days`}</title>
                </rect>
                <text
                  className="insight-rhythm-sample"
                  x={x + barWidth / 2}
                  y={Math.max(top + 12, barY - 7)}
                  textAnchor="middle"
                >{`n=${bucket.count}`}</text>
                <text
                  className="insight-rhythm-label"
                  x={x + barWidth / 2}
                  y={baseline + 19}
                  textAnchor="middle"
                >
                  {bucket.label.slice(0, 3)}
                </text>
                <text
                  className="insight-rhythm-logged"
                  x={x + barWidth / 2}
                  y={baseline + 34}
                  textAnchor="middle"
                >{`${bucket.loggedCount}d`}</text>
              </g>
            );
          })}
          {path ? (
            <path
              className="insight-rhythm-activity-line"
              d={path}
              fill="none"
            />
          ) : null}
          {overlayActivityName
            ? buckets.map((bucket, index) => {
                const fraction = bucket.activityFrequency?.fraction ?? null;
                if (fraction === null) {
                  return null;
                }
                return (
                  <circle
                    className="insight-rhythm-activity-dot"
                    key={`${bucket.key}-activity`}
                    cx={left + step * (index + 0.5)}
                    cy={
                      baseline - Math.max(0, Math.min(1, fraction)) * plotHeight
                    }
                    r="4"
                  >
                    <title>{`${bucket.label}: ${formatPercent(fraction)} of logged days included ${overlayActivityName}`}</title>
                  </circle>
                );
              })
            : null}
        </svg>
      </div>
      <div
        className="insights-legend insight-rhythm-chart-legend"
        aria-label={`${title} legend`}
      >
        <span>
          <i className="insight-rhythm-legend-bar" aria-hidden="true" /> Mean
          mood
        </span>
        {overlayActivityName ? (
          <span>
            <i className="insight-rhythm-legend-line" aria-hidden="true" />{" "}
            {overlayActivityName}: recorded fraction
          </span>
        ) : null}
        <span>
          <i className="insight-rhythm-legend-sample" aria-hidden="true" /> n =
          mood observations · d = logged days
        </span>
      </div>
      <div className="sr-only">
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Bucket</th>
              <th scope="col">Mood observations</th>
              <th scope="col">Logged days</th>
              <th scope="col">Mean mood</th>
              {overlayActivityName ? (
                <th scope="col">Activity recorded fraction</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {buckets.map((bucket) => (
              <tr key={`${title}-${bucket.key}`}>
                <th scope="row">{bucket.label}</th>
                <td>{bucket.count}</td>
                <td>{bucket.loggedCount}</td>
                <td>{formatMean(bucket.mean)}</td>
                {overlayActivityName ? (
                  <td>
                    {formatPercent(bucket.activityFrequency?.fraction ?? null)}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
