import type { Goal } from "@app/common/features/catalog/types";
import { ALL_WEEKDAYS_MASK } from "@app/common/features/catalog/utils/goal-config";
import { MaterialIcon } from "../../core/ui/material-icon.js";
import { actionKey, reorderKey } from "../utils/catalog-mutations.js";
import { buildSetupView } from "../utils/setup-view.js";
import { ActionButton } from "./action-button.js";
import { useCatalogSetup } from "./catalog-setup-context.js";

function scheduleOf(goal: Goal): string {
  if (goal.repeatType === "weekly" || goal.scheduleType === "times_per_week") {
    const days = goal.targetPerWeek ?? 1;
    return `${days} ${days === 1 ? "day" : "days"} per week`;
  }
  return goal.weekdaysMask && goal.weekdaysMask !== ALL_WEEKDAYS_MASK
    ? "Selected weekdays"
    : "Every day";
}

interface GoalsSectionProps {
  onConfigureGoal: (goalId: string) => void;
}

/** The goals, with the form for a new goal. */
export function SetupGoalsSection({ onConfigureGoal }: GoalsSectionProps) {
  const { logic, state } = useCatalogSetup();
  const view = buildSetupView({
    groups: state.groups,
    activities: state.activities,
    goals: state.goals,
    overrides: state.overrides,
    query: "",
  });
  const goalReordering = logic.isPending(reorderKey("goal"));
  const creatingGoal = logic.isPending("create:goal");
  const goalFormBusy = goalReordering || creatingGoal;
  const activeCount = view.goals.filter((goal) => !goal.archived).length;
  return (
    <section className="settings-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Goals</p>
          <h2>{`${activeCount} active · ${view.goals.length} total`}</h2>
        </div>
      </div>
      <div className="management-list">
        {view.goals.map((goal, index) => {
          const pending =
            logic.isPending(actionKey({ kind: "goal", id: goal.id })) ||
            goalReordering;
          const updating = `Updating ${goal.name}…`;
          const activityName =
            view.activities.find((activity) => activity.id === goal.activityId)
              ?.name ?? "No associated activity";
          return (
            <div
              key={goal.id}
              className={`management-row ${goal.archived ? "archived" : ""}`}
              data-id={goal.id}
            >
              <span className="management-icon">
                <MaterialIcon name={goal.materialIcon} />
              </span>
              <span className="management-copy">
                <strong>{goal.name}</strong>
                <small>{`${scheduleOf(goal)} · ${activityName}${goal.archived ? " · archived" : ""}`}</small>
              </span>
              <span className="management-actions">
                <ActionButton
                  label={pending ? updating : `Configure ${goal.name}`}
                  icon="edit"
                  busy={pending}
                  disabled={pending}
                  onClick={() => onConfigureGoal(goal.id)}
                />
                <ActionButton
                  label={goalReordering ? updating : `Move ${goal.name} up`}
                  icon="arrow_upward"
                  busy={goalReordering}
                  disabled={index === 0 || goalReordering || pending}
                  onClick={() =>
                    void logic.move({
                      kind: "goal",
                      itemId: goal.id,
                      items: view.goals,
                      direction: -1,
                    })
                  }
                />
                <ActionButton
                  label={goalReordering ? updating : `Move ${goal.name} down`}
                  icon="arrow_downward"
                  busy={goalReordering}
                  disabled={
                    index === view.goals.length - 1 || goalReordering || pending
                  }
                  onClick={() =>
                    void logic.move({
                      kind: "goal",
                      itemId: goal.id,
                      items: view.goals,
                      direction: 1,
                    })
                  }
                />
                <ActionButton
                  label={
                    pending
                      ? updating
                      : goal.archived
                        ? `Restore ${goal.name}`
                        : `Archive ${goal.name}`
                  }
                  icon={goal.archived ? "unarchive" : "archive"}
                  busy={pending}
                  disabled={pending}
                  onClick={() =>
                    void logic.archive({
                      kind: "goal",
                      id: goal.id,
                      archived: goal.archived,
                    })
                  }
                />
                <ActionButton
                  danger
                  label={pending ? updating : `Delete ${goal.name}`}
                  icon="delete"
                  busy={pending}
                  disabled={pending}
                  onClick={() =>
                    void logic.remove({
                      kind: "goal",
                      id: goal.id,
                      name: goal.name,
                    })
                  }
                />
              </span>
            </div>
          );
        })}
      </div>
      <div className="inline-form stacked-mobile">
        <input
          placeholder="New goal name"
          aria-label="New goal name"
          value={state.newGoalName}
          aria-busy={goalFormBusy}
          disabled={goalFormBusy}
          onChange={(event) =>
            logic.setNewGoalName({ name: event.target.value })
          }
        />
        <button
          type="button"
          className="secondary-button"
          aria-busy={goalFormBusy}
          disabled={goalFormBusy}
          onClick={() => void logic.createGoal()}
        >
          {goalFormBusy ? (
            <span className="spinner" aria-hidden="true" />
          ) : (
            <MaterialIcon name="add" />
          )}{" "}
          {creatingGoal
            ? "Adding…"
            : goalReordering
              ? "Reordering…"
              : "Add goal"}
        </button>
      </div>
      <p className="muted small-copy">
        New goals start with a daily schedule and no associated activity. Use
        Configure to set their repeat, icon, and activity.
      </p>
    </section>
  );
}
