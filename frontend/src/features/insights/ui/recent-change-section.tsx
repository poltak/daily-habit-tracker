import {
  formatMoodDifference,
  formatPercent,
} from "../utils/insights-format.js";
import type { RecentChange } from "../utils/recent-change.js";

function tone(difference: number | null): string {
  if (difference === null || difference === 0) {
    return "flat";
  }
  return difference > 0 ? "up" : "down";
}

export function RecentChangeSection({ recent }: { recent: RecentChange }) {
  return (
    <section className="insights-card" aria-labelledby="insights-recent-title">
      <h2 id="insights-recent-title">What changed lately</h2>
      {!recent.enough && (
        <p className="insights-help">
          Choose a period longer than 120 days to compare your last 90 days with
          the time before.
        </p>
      )}
      {recent.enough && (
        <>
          <p className="insights-help">
            How often each activity happened in the last 90 days, compared with
            the time before. The hollow dot is the time before and the filled
            dot is the last 90 days: green when your mood was better on days
            with the activity, red when it was worse. The mood figure is for the
            last 90 days.
          </p>
          {recent.items.length === 0 ? (
            <p className="insights-help">
              No activity changed by 10 points or more.
            </p>
          ) : (
            <ul className="insights-dumbbells" aria-label="Activity changes">
              {recent.items.map((item) => {
                const frequency = `${formatPercent(item.before)} → ${formatPercent(item.after)} of days`;
                const mood =
                  item.moodDifference === null
                    ? "few days"
                    : `${formatMoodDifference(item.moodDifference)} mood`;
                return (
                  <li
                    key={item.activityId}
                    aria-label={`${item.name}, ${frequency}, ${mood}`}
                  >
                    <span className="insights-dumbbell-name">{item.name}</span>
                    <span
                      className="insights-dumbbell-track"
                      aria-hidden="true"
                    >
                      <span
                        className="insights-dumbbell-line"
                        style={{
                          left: `${Math.min(item.before, item.after) * 100}%`,
                          width: `${Math.abs(item.after - item.before) * 100}%`,
                        }}
                      />
                      <i
                        className="insights-dumbbell-before"
                        style={{ left: `${item.before * 100}%` }}
                      />
                      <i
                        className={`insights-dumbbell-after ${tone(item.moodDifference)}`}
                        style={{ left: `${item.after * 100}%` }}
                      />
                    </span>
                    <span className="insights-dumbbell-text">
                      {frequency}
                      <small>{mood}</small>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
