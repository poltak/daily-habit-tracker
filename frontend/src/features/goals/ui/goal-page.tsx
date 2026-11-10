import { useMemo } from "react";
import type { Goal } from "@app/common/features/catalog/types";
import {
  formatLogicalDate,
  formatMonth,
  weekdayOrder,
  WEEKDAY_NAMES,
} from "@app/common/features/core/utils/logical-date";
import { monthCells } from "@app/common/features/days/utils/month-grid";
import { useLogic } from "../../core/logic/use-logic.js";
import { useFrontendApp } from "../../core/ui/frontend-app-context.js";
import { MaterialIcon } from "../../core/ui/material-icon.js";
import { explainer, statusIcon, statusLabel } from "../utils/goal-text.js";
import { GoalLogic } from "./goal-logic.js";

interface GoalHistoryPageProps {
  goal: Goal;
  /** The month to show first, as `YYYY-MM`. */
  initialMonth: string;
  onBack: () => void;
}

function shortDate(date: string): string {
  return formatLogicalDate({ date, style: "short" });
}

function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

function GoalHistoryPage({ goal, initialMonth, onBack }: GoalHistoryPageProps) {
  const app = useFrontendApp();
  const deps = useMemo(
    () => ({
      storage: {},
      services: { clock: app.services.clock },
      api: { goals: app.api.goals, settings: app.api.settings },
      goalId: goal.id,
      initialMonth,
    }),
    [app, goal.id, initialMonth],
  );
  const { logic, state } = useLogic({ LogicClass: GoalLogic, deps });
  const { month, history, weekEndsOn } = state;
  const loading = state.loadHistoryState === "running";
  const days = new Map(history?.days.map((day) => [day.logicalDate, day]));
  return (
    <section className="page-section goal-detail-page">
      <div className="page-intro goal-detail-intro">
        <button type="button" className="back-button" onClick={onBack}>
          <MaterialIcon name="arrow_back" /> Goals
        </button>
        <div className="goal-detail-title">
          <span className="goal-detail-icon">
            <MaterialIcon name={goal.materialIcon} />
          </span>
          <div>
            <p className="eyebrow">Goal history</p>
            <h1>{goal.name}</h1>
            <p className="muted">
              Completed days and weekly progress for this goal.
            </p>
          </div>
        </div>
      </div>
      {state.loadHistoryError && (
        <div className="notice error" role="alert">
          <p>{state.loadHistoryError}</p>
          <button
            type="button"
            className="loading-retry"
            onClick={() => void logic.loadHistory()}
          >
            Retry
          </button>
        </div>
      )}
      <section className="calendar-card goal-history-card" aria-busy={loading}>
        <div className="calendar-heading">
          <button
            type="button"
            className="icon-button"
            aria-label="Previous month"
            aria-busy={loading}
            disabled={loading}
            onClick={() => void logic.showMonth({ amount: -1 })}
          >
            {loading ? <Spinner /> : <MaterialIcon name="chevron_left" />}
          </button>
          <h2>{formatMonth(month)}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Next month"
            aria-busy={loading}
            disabled={loading}
            onClick={() => void logic.showMonth({ amount: 1 })}
          >
            {loading ? <Spinner /> : <MaterialIcon name="chevron_right" />}
          </button>
        </div>
        <p className="muted goal-history-explainer">{explainer(goal)}</p>
        <div className="calendar-weekdays">
          {weekdayOrder(weekEndsOn).map((weekday) => (
            <span key={weekday}>{WEEKDAY_NAMES[weekday]?.slice(0, 3)}</span>
          ))}
        </div>
        <div className="calendar-grid goal-calendar-grid">
          {monthCells({ month, weekEndsOn }).map((date, index) => {
            if (!date) {
              return <span key={`blank-${index}`} className="calendar-blank" />;
            }
            const day = days.get(date);
            const dayState = day?.completed ? "completed" : "not completed";
            return (
              <div
                key={date}
                className={`calendar-day goal-day ${day?.completed ? "completed" : "not-completed"}`}
                // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- A cell that holds a number and an icon has no native tag, and the label gives its state.
                role="img"
                aria-label={`${date}: ${dayState}${day?.scheduled ? ", expected" : ""}`}
              >
                <span>{Number(date.slice(-2))}</span>
                {day?.scheduled && (
                  <MaterialIcon name={day.completed ? "check" : "remove"} />
                )}
              </div>
            );
          })}
        </div>
        {loading && (
          <output className="calendar-loading">Checking this month…</output>
        )}
        <div className="calendar-legend goal-calendar-legend">
          <span>
            <i className="legend-dot goal-completed" /> Completed
          </span>
          <span>
            <i className="legend-dot goal-not-completed" /> Not completed
          </span>
        </div>
      </section>
      <section className="goal-week-history" aria-live="polite">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Weekly result</p>
            <h2>Was the goal accomplished?</h2>
          </div>
        </div>
        {!history && loading && (
          <p className="inline-loading">Loading weekly results…</p>
        )}
        {history?.weeks.map((week) => (
          <fieldset
            key={week.weekStart}
            className={`goal-week-row ${week.status}`}
            aria-label={`${shortDate(week.weekStart)} – ${shortDate(week.weekEnd)}`}
          >
            <span
              className={`goal-week-status ${week.status}`}
              aria-label={statusLabel(week.status)}
            >
              <MaterialIcon name={statusIcon(week.status)} />
            </span>
            <span className="goal-week-copy">
              <strong>
                {shortDate(week.weekStart)} – {shortDate(week.weekEnd)}
              </strong>
              <small>
                {statusLabel(week.status)} · {week.completedCount}/
                {week.expectedCount}{" "}
                {week.repeatType === "daily" ? "scheduled days" : "days"}
              </small>
            </span>
          </fieldset>
        ))}
      </section>
    </section>
  );
}

/** One goal: the history of its completed days. A goal that is gone or archived has no history. */
export function GoalPage({
  goal,
  ...props
}: Omit<GoalHistoryPageProps, "goal"> & { goal: Goal | undefined }) {
  if (!goal) {
    return (
      <section className="page-section">
        <button type="button" className="ghost-button" onClick={props.onBack}>
          Back to goals
        </button>
        <p className="empty-inline">That goal is no longer available.</p>
      </section>
    );
  }
  return <GoalHistoryPage key={goal.id} goal={goal} {...props} />;
}
