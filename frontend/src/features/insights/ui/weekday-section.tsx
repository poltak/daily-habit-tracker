import { formatPercent } from "../utils/insights-format.js";
import type { WeekdayShare } from "../utils/weekday-share.js";

export function WeekdaySection({ weekdays }: { weekdays: WeekdayShare[] }) {
  return (
    <section
      className="insights-card"
      aria-labelledby="insights-weekdays-title"
    >
      <h2 id="insights-weekdays-title">Good days by weekday</h2>
      <ul
        className="insights-weekdays"
        aria-labelledby="insights-weekdays-title"
      >
        {weekdays.map((weekday) => {
          const percent = formatPercent(weekday.share);
          return (
            <li
              key={weekday.name}
              title={`${weekday.days} ${weekday.days === 1 ? "day" : "days"}`}
              aria-label={`${weekday.name} ${percent}, ${weekday.days} ${weekday.days === 1 ? "day" : "days"}`}
            >
              <span className="insights-weekday-bar" aria-hidden="true">
                <span
                  className={weekday.best ? "best" : ""}
                  style={{ height: `${(weekday.share ?? 0) * 100}%` }}
                />
              </span>
              <span>{weekday.shortName}</span>
              <strong>{percent}</strong>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
