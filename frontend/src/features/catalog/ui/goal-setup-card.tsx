import { WEEKDAY_NAMES } from "@app/common/features/settings/utils/week";
import { MaterialIcon } from "../../core/ui/material-icon.js";
import type { GoalSetupLogic } from "./goal-setup-logic.js";

const WEEKDAY_LABELS = WEEKDAY_NAMES.map((name) => name.slice(0, 3));
const TARGETS = [1, 2, 3, 4, 5, 6, 7];

function targetLabel(count: number): string {
  return count === 7
    ? "Every day"
    : `${count} ${count === 1 ? "day" : "days"} per week`;
}

interface GoalSetupCardProps {
  logic: GoalSetupLogic;
  state: GoalSetupLogic["state"];
  onArchive: () => void;
  onRemove: () => void;
}

/** The name, repeat, activity and icon of one goal, with its save, archive and delete. */
export function GoalSetupCard({
  logic,
  state,
  onArchive,
  onRemove,
}: GoalSetupCardProps) {
  const busy = logic.isBusy;
  const saving = state.action === "save";
  const isDaily = state.repeatType === "daily";
  const linked = state.activities.find(
    (activity) => activity.id === state.activityId,
  );
  const options = state.activities.filter(
    (activity) => !activity.archived || activity.id === state.activityId,
  );
  return (
    <section className="settings-card goal-config-card" aria-busy={busy}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Goal settings</p>
          <h2>Repeat, activity, and icon</h2>
          <p className="muted small-copy">
            Choose when this goal is expected, and optionally link it to an
            activity.
          </p>
        </div>
      </div>
      <label className="goal-config-field">
        <span>Name</span>
        <input
          value={state.name}
          disabled={busy}
          onChange={(event) => logic.setName({ name: event.target.value })}
        />
      </label>
      <div className="goal-config-row">
        <label className="goal-config-field">
          <span>Repeat</span>
          <select
            aria-label="Repeat"
            value={state.repeatType}
            disabled={busy}
            onChange={(event) =>
              logic.setRepeat({
                repeatType:
                  event.target.value === "weekly" ? "weekly" : "daily",
              })
            }
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </label>
        <div className="goal-icon-setting">
          <span>Icon</span>
          <button
            type="button"
            className="goal-icon-button"
            aria-label="Choose goal icon"
            disabled={busy}
            onClick={() => logic.openIconPicker()}
          >
            <MaterialIcon name={state.materialIcon} />
            <span>Change icon</span>
          </button>
        </div>
      </div>
      <label className="goal-config-field">
        <span>Associated activity</span>
        <select
          aria-label="Associated activity"
          value={state.activityId ?? ""}
          disabled={busy}
          onChange={(event) =>
            logic.setActivity({ activityId: event.target.value || null })
          }
        >
          <option value="">No associated activity</option>
          {options.map((activity) => (
            <option key={activity.id} value={activity.id}>
              {`${activity.name}${activity.archived ? " (archived)" : ""}`}
            </option>
          ))}
        </select>
        {linked?.archived && (
          <small className="muted">
            This activity is archived but remains linked.
          </small>
        )}
      </label>
      {isDaily ? (
        <fieldset className="weekday-picker" disabled={busy}>
          <legend>Days expected</legend>
          <div className="weekday-options">
            {WEEKDAY_LABELS.map((label, index) => {
              const selected = Boolean(state.weekdaysMask & (1 << index));
              return (
                <label
                  key={label}
                  className={`weekday-option ${selected ? "selected" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => logic.toggleWeekday({ index })}
                  />
                  <span>{label}</span>
                </label>
              );
            })}
          </div>
          <small className="muted">Select at least one day.</small>
        </fieldset>
      ) : (
        <fieldset className="weekly-target-picker" disabled={busy}>
          <legend>Days per week</legend>
          <div className="weekly-target-options">
            {TARGETS.map((count) => (
              <label
                key={count}
                className={`weekly-target-option ${state.targetPerWeek === count ? "selected" : ""}`}
              >
                <input
                  type="radio"
                  name="goal-target-per-week"
                  value={count}
                  checked={state.targetPerWeek === count}
                  onChange={() => logic.setTarget({ targetPerWeek: count })}
                />
                <span>{targetLabel(count)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="goal-config-actions">
        <button
          type="button"
          className="primary-button"
          aria-busy={saving}
          disabled={busy || !logic.isDirty}
          onClick={() => void logic.save()}
        >
          {saving ? "Saving…" : "Save goal"}
        </button>
        {logic.isDirty && !busy && (
          <span className="muted small-copy">Unsaved goal changes</span>
        )}
      </div>
      <div className="goal-config-actions goal-manage-actions">
        <button
          type="button"
          className="secondary-button compact-button"
          aria-busy={state.action === "archive"}
          disabled={busy}
          onClick={onArchive}
        >
          {state.action === "archive" ? (
            <span className="spinner" aria-hidden="true" />
          ) : (
            <MaterialIcon name="archive" />
          )}{" "}
          {state.action === "archive" ? "Archiving…" : "Archive goal"}
        </button>
        <button
          type="button"
          className="ghost-button danger compact-button"
          aria-busy={state.action === "delete"}
          disabled={busy}
          onClick={onRemove}
        >
          {state.action === "delete" ? (
            <span className="spinner" aria-hidden="true" />
          ) : (
            <MaterialIcon name="delete" />
          )}{" "}
          {state.action === "delete" ? "Deleting…" : "Delete goal"}
        </button>
        <span className="muted small-copy">
          Archive hides the goal and keeps its history. Delete removes the goal
          and its history for good.
        </span>
      </div>
    </section>
  );
}
