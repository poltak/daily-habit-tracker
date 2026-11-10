import { useMemo } from "react";
import { useLogic } from "../../core/logic/use-logic.js";
import { useFrontendApp } from "../../core/ui/frontend-app-context.js";
import { MaterialIcon } from "../../core/ui/material-icon.js";
import { InsightsLogic } from "./insights-logic.js";
import { RelationshipSections } from "./relationship-sections.js";
import { RhythmSections } from "./rhythm-sections.js";

const SECTIONS = [
  ["insights-activities", "Activities"],
  ["insights-next-day", "Next day"],
  ["insights-combinations", "Combinations"],
  ["insights-rhythms", "Rhythms"],
  ["insights-best-weeks", "Best weeks"],
] as const;

function EmptyCard({ hasHistory }: { hasHistory: boolean }) {
  return (
    <div className="insights-card insights-empty">
      <MaterialIcon name="insights" />
      <h2>
        {hasHistory
          ? "No entries in this period"
          : "Your patterns start with a day"}
      </h2>
      <p>
        {hasHistory
          ? "Try a wider date range to explore your recorded history."
          : "Save moods and activities in your journal. As your history grows, your patterns will appear here."}
      </p>
    </div>
  );
}

/**
 * The analysis of the whole saved history for a period that the owner picks.
 * A week ends on `weekEndsOn`, a weekday number where 0 is Sunday.
 */
export function InsightsPage({ weekEndsOn }: { weekEndsOn: number }) {
  const app = useFrontendApp();
  const deps = useMemo(
    () => ({
      storage: {},
      services: { clock: app.services.clock },
      api: { insights: app.api.insights },
    }),
    [app],
  );
  const { logic, state } = useLogic({ LogicClass: InsightsLogic, deps });
  const { data } = state;
  const period = logic.period();
  const { validRange, days } = period;
  return (
    <div className="page-section insights-page">
      <div className="page-intro insights-intro">
        <p className="eyebrow">A little perspective</p>
        <h1>Your everyday, over time.</h1>
        <p className="muted">
          Explore the activities, rhythms, and combinations that accompany your
          moods.
        </p>
      </div>
      {!data && !state.loadError && (
        <output className="insights-card insights-loading" aria-busy="true">
          <MaterialIcon name="insights" />
          <p>Looking through your journal…</p>
          <span className="insights-help">
            Loading your full recorded history.
          </span>
        </output>
      )}
      {state.loadError && (
        <div className="insights-card" role="alert">
          <h2>Insights couldn’t load</h2>
          <p className="insights-help">{state.loadError}</p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void logic.load()}
          >
            Try again
          </button>
        </div>
      )}
      {data && (
        <>
          <div className="insights-toolbar">
            <label className="insights-field">
              <span>Explore a period</span>
              <select
                className="insights-select"
                value={state.preset}
                onChange={(event) =>
                  logic.choosePeriod({ preset: event.target.value })
                }
              >
                <option value="all">All time</option>
                <option value="90d">Last 90 days</option>
                <option value="1y">Last 365 days</option>
                {period.years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
                <option value="custom">Custom dates</option>
              </select>
            </label>
            {state.preset === "custom" && (
              <div className="insights-custom-range">
                <label className="insights-field">
                  <span>From</span>
                  <input
                    className="insights-select"
                    type="date"
                    value={state.customStart}
                    max={state.customEnd || state.today}
                    onChange={(event) =>
                      logic.setCustomStart({ value: event.target.value })
                    }
                  />
                </label>
                <label className="insights-field">
                  <span>To</span>
                  <input
                    className="insights-select"
                    type="date"
                    value={state.customEnd}
                    min={state.customStart || undefined}
                    max={state.today}
                    onChange={(event) =>
                      logic.setCustomEnd({ value: event.target.value })
                    }
                  />
                </label>
              </div>
            )}
            <p className="insights-toolbar-note">
              <MaterialIcon name="auto_graph" />
              <span>
                Patterns in your records.
                <br />A starting point for curiosity.
              </span>
            </p>
          </div>
          {!validRange && (
            <p className="notice error" role="alert">
              Choose a valid date range ending today or earlier.
            </p>
          )}
          {validRange && (
            <div
              className="insights-summary"
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- No element has this role without a visible border or legend.
              role="group"
              aria-label="Selected period summary"
            >
              <div>
                <strong>{days.length.toLocaleString()}</strong>
                <span>recorded days</span>
              </div>
              <div>
                <strong>
                  {period.calendarDays
                    ? Math.round((days.length / period.calendarDays) * 100)
                    : 0}
                  <small>%</small>
                </strong>
                <span>of days recorded</span>
              </div>
              <div>
                <strong>{period.activityCount}</strong>
                <span>activities recorded</span>
              </div>
            </div>
          )}
          {validRange && days.length === 0 && (
            <EmptyCard hasHistory={period.history.length > 0} />
          )}
        </>
      )}
      {data && period.showAnalysis && (
        <>
          <nav className="insights-jump-links" aria-label="Insight sections">
            {SECTIONS.map(([id, label]) => (
              <a key={id} href={`#${id}`}>
                {label}
                <span aria-hidden="true">↗</span>
              </a>
            ))}
          </nav>
          <p className="insights-method-note">
            These are associations, not explanations. “Not recorded” means an
            activity wasn’t selected on a recorded day; missing days are
            excluded. Small samples can change quickly.
          </p>
          <RelationshipSections
            logic={logic}
            view={logic.relationships()}
            moods={data.moods}
            hasDays={days.length > 0}
          />
          <RhythmSections
            logic={logic}
            view={logic.rhythms({ weekEndsOn })}
            moods={data.moods}
            activities={data.activities}
            groups={data.groups}
          />
        </>
      )}
    </div>
  );
}
