import type { ReactNode } from "react";
import type { PageView } from "../types.js";

const TITLES: Record<PageView, string> = {
  log: "How was your day?",
  calendar: "Your calendar",
  insights: "Your insights",
  settings: "Your setup",
  goal: "Goal history",
  "add-activity": "Add activity",
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
          <p className="eyebrow">
            {shown === "log" ? "Daily journal" : "Your journal"}
          </p>
          <h1>{TITLES[shown]}</h1>
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
