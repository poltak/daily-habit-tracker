import type { SummaryView } from "../utils/insights-view.js";
import { formatPercent, formatPoints } from "../utils/insights-format.js";

export function SummarySection({ summary }: { summary: SummaryView }) {
  const { change } = summary;
  return (
    <div
      className="insights-summary"
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- No element has this role without a visible border or legend.
      role="group"
      aria-label="Selected period summary"
    >
      <div>
        <strong>{formatPercent(summary.goodShare)}</strong>
        <span>good days</span>
        {change && (
          <span
            className={`insights-change ${change.points > 0 ? "up" : change.points < 0 ? "down" : ""}`.trim()}
          >
            {formatPoints(change.points)} vs {change.against}
          </span>
        )}
      </div>
      <div>
        <strong>
          {summary.meanMood === null ? "—" : summary.meanMood.toFixed(2)}
        </strong>
        <span>average mood</span>
      </div>
      <div>
        <strong>{summary.recordedDays.toLocaleString()}</strong>
        <span>recorded days</span>
      </div>
    </div>
  );
}
