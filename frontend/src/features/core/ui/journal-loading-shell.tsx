import type { ReactNode } from "react";
import type { PageView } from "../types.js";

// The same eyebrow and title as each loaded page, so the text does not change when the data arrives.
const INTROS: Record<PageView, { eyebrow: string; title: string }> = {
  log: { eyebrow: "Your daily check-in", title: "How was your day?" },
  calendar: { eyebrow: "Your history", title: "Calendar" },
  insights: {
    eyebrow: "A little perspective",
    title: "Your everyday, over time.",
  },
  settings: { eyebrow: "Your setup", title: "Make it yours" },
  // The name of the goal is not known before the data arrives.
  goal: { eyebrow: "Goal history", title: "Your goal" },
  "add-activity": { eyebrow: "Activities", title: "Add new activity" },
};

/**
 * The page that shows until the journal has its first data, as the static
 * shell of the old site did. `error` takes the place of the status line when
 * the first read fails.
 */
export function JournalLoadingShell({
  view,
  error,
}: {
  /** Only the eyebrow and the title change with the page. */
  view: PageView | null;
  error?: ReactNode;
}) {
  const shown = view ?? "log";
  return (
    <div className="journal-loading" aria-busy={!error}>
      {error ?? <output className="sr-only">Loading journal data…</output>}
      <section className="hero-card">
        <div>
          <p className="eyebrow">{INTROS[shown].eyebrow}</p>
          <h1>{INTROS[shown].title}</h1>
          <div
            className="loading-placeholder loading-line"
            aria-hidden="true"
          />
        </div>
      </section>
      <div className="loading-panels" aria-hidden="true">
        <section className="panel">
          <div className="loading-placeholder loading-heading" />
          <div className="loading-placeholder loading-row" />
          <div className="loading-placeholder loading-row" />
        </section>
        <section className="panel">
          <div className="loading-placeholder loading-heading" />
          <div className="mood-grid">
            {[0, 1, 2, 3, 4].map((index) => (
              <div key={index} className="loading-placeholder loading-mood" />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
