import { useId } from "react";
import { formatMoodDifference } from "../utils/insights-format.js";
import type { MoodLinkItem, MoodLinks } from "../utils/mood-links.js";

function MoodLinkList({
  title,
  items,
  minDays,
}: {
  title: string;
  items: MoodLinkItem[];
  minDays: number;
}) {
  const titleId = useId();
  return (
    <div className="insights-links-block">
      <h3 id={titleId}>{title}</h3>
      {items.length === 0 ? (
        <p className="insights-help">
          Not enough days yet. An activity shows here after it has at least{" "}
          {minDays} days with it and {minDays} days without it.
        </p>
      ) : (
        <ul className="insights-diverge" aria-labelledby={titleId}>
          {items.map((item) => {
            const text = formatMoodDifference(item.difference);
            return (
              <li
                key={item.activityId}
                aria-label={`${item.name}, ${item.days} days, ${text}`}
              >
                <span className="insights-diverge-name">
                  {item.name}
                  <small>{item.days} days</small>
                </span>
                <span className="insights-diverge-track" aria-hidden="true">
                  <span
                    className={item.difference > 0 ? "up" : "down"}
                    style={{ width: `${item.length * 50}%` }}
                  />
                </span>
                <strong className={item.difference > 0 ? "up" : "down"}>
                  {text}
                </strong>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function MoodLinksSection({ links }: { links: MoodLinks }) {
  return (
    <section className="insights-card" aria-labelledby="insights-links-title">
      <h2 id="insights-links-title">What goes with better and worse days</h2>
      <p className="insights-help">
        Average mood on days with an activity compared with days without it.
        These are associations in your entries, not causes.
      </p>
      <MoodLinkList
        title="What you do"
        items={links.whatYouDo}
        minDays={links.minDays}
      />
      {links.howYouFelt && (
        <MoodLinkList
          title="How you felt"
          items={links.howYouFelt}
          minDays={links.minDays}
        />
      )}
    </section>
  );
}
