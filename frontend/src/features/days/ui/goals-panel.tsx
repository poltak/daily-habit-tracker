import type { Activity, Goal } from "@app/common/features/catalog/types";
import { MaterialIcon } from "../../core/ui/material-icon.js";

/** The weekdays of a goal, as a mask: Sunday is the lowest bit. */
const ALL_WEEKDAYS_MASK = 0b1111111;

function describeRepeat(goal: Goal): string {
  if (goal.repeatType === "weekly") {
    const days = goal.targetPerWeek ?? 1;
    return `${days} ${days === 1 ? "day" : "days"} this week`;
  }
  return (goal.weekdaysMask ?? ALL_WEEKDAYS_MASK) === ALL_WEEKDAYS_MASK
    ? "Every day"
    : "Selected weekdays";
}

interface GoalsPanelProps {
  goals: readonly Goal[];
  activities: readonly Activity[];
  completedGoalIds: readonly string[];
  /** The goals that wait for the server, because their activity was tapped. */
  pendingGoalIds: ReadonlySet<string>;
  /** True while the day loads. */
  loading: boolean;
  onOpen: (goalId: string) => void;
}

export function GoalsPanel({
  goals,
  activities,
  completedGoalIds,
  pendingGoalIds,
  loading,
  onOpen,
}: GoalsPanelProps) {
  const active = goals.filter((goal) => !goal.archived);
  const completed = new Set(completedGoalIds);
  const done = active.filter((goal) => completed.has(goal.id)).length;
  return (
    <section className="panel goals-panel" aria-busy={loading}>
      <div className="section-heading">
        <h2>Goals</h2>
        <span className="section-count" aria-label="Completed goals">
          {done}/{active.length}
        </span>
      </div>
      <div className="goal-list">
        {active.map((goal) => {
          const checked = completed.has(goal.id);
          const pending = pendingGoalIds.has(goal.id);
          const unavailable = pending || loading;
          const activity = activities.find(
            (item) => item.id === goal.activityId,
          );
          return (
            <div
              key={goal.id}
              className={`goal-row ${checked ? "checked" : ""}`}
              aria-busy={pending}
              aria-disabled={unavailable}
            >
              {/* A tap on the switch of a goal is part of the goals page. */}
              <button
                type="button"
                className="goal-checkbox"
                disabled
                aria-label={`Mark ${goal.name} ${checked ? "not completed" : "completed"}`}
                aria-pressed={checked}
              >
                {checked && <MaterialIcon name="check" />}
              </button>
              <button
                type="button"
                className="goal-main"
                disabled={unavailable}
                aria-label={`Open ${goal.name} goal`}
                onClick={() => onOpen(goal.id)}
              >
                <span className="goal-copy">
                  <strong>
                    <MaterialIcon name={goal.materialIcon} /> {goal.name}
                  </strong>
                  <small>
                    {pending
                      ? "Saving…"
                      : loading
                        ? "Loading day…"
                        : `${describeRepeat(goal)}${activity ? ` · ${activity.name}` : ""}`}
                  </small>
                </span>
                <span className="goal-arrow">
                  <MaterialIcon name="chevron_right" />
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
