import { useMemo, type ReactNode } from "react";
import { goalRepeatType } from "@app/common/features/catalog/utils/goal-config";
import { useLogic } from "../../core/logic/use-logic.js";
import { useFrontendApp } from "../../core/ui/frontend-app-context.js";
import { MaterialIcon } from "../../core/ui/material-icon.js";
import type { NoticeTarget } from "../types.js";
import { CatalogNotice } from "./catalog-notice.js";
import { GoalSetupCard } from "./goal-setup-card.js";
import { GoalSetupLogic } from "./goal-setup-logic.js";
import { IconPicker } from "./icon-picker.js";
import "./catalog.css";

interface GoalSetupPageProps {
  goalId: string;
  returnTo: NoticeTarget;
  /** Go back to the page that opened the goal. */
  onClose: () => void;
  /** What the page shows under the settings: the history of the goal. */
  children?: ReactNode;
}

/** One goal: the page title and its settings. The history of the goal goes in `children`. */
export function GoalSetupPage({
  goalId,
  returnTo,
  onClose,
  children,
}: GoalSetupPageProps) {
  const app = useFrontendApp();
  const deps = useMemo(
    () => ({
      storage: {},
      services: { device: app.services.device, dialogs: app.services.dialogs },
      api: { catalog: app.api.catalog },
      catalogEvents: app.catalogEvents,
      goalId,
      returnTo,
    }),
    [app, goalId, returnTo],
  );
  const { logic, state } = useLogic({ LogicClass: GoalSetupLogic, deps });
  const { goal } = state;

  function leave() {
    if (logic.canLeave()) {
      onClose();
    }
  }

  async function archive() {
    if (await logic.archive()) {
      onClose();
    }
  }

  async function remove() {
    if (await logic.remove()) {
      onClose();
    }
  }

  if (!goal) {
    if (
      state.loadGoalState === "pristine" ||
      state.loadGoalState === "running"
    ) {
      return <section className="page-section" aria-busy="true" />;
    }
    return (
      <section className="page-section">
        <button type="button" className="ghost-button" onClick={onClose}>
          Back to goals
        </button>
        <p className="empty-inline">
          {state.loadGoalError ?? "That goal is no longer available."}
        </p>
      </section>
    );
  }

  const target = goal.targetPerWeek ?? 1;
  return (
    <section className="page-section goal-detail-page">
      <div className="page-intro goal-detail-intro">
        <button
          type="button"
          className="back-button"
          disabled={logic.isBusy}
          onClick={leave}
        >
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
      <CatalogNotice notice={state.notice} />
      <GoalSetupCard
        logic={logic}
        state={state}
        onArchive={() => void archive()}
        onRemove={() => void remove()}
      />
      {children ?? (
        <p className="muted goal-history-explainer">
          {goalRepeatType(goal) === "daily"
            ? "Green days are completed; pale days are not completed. A dash marks an expected day."
            : `Green days are completed. Each week needs ${target} completed ${target === 1 ? "day" : "days"}.`}
        </p>
      )}
      {state.iconPickerOpen && (
        <IconPicker
          kind="Goal"
          subject={state.name || goal.name}
          currentIcon={state.materialIcon}
          isSaving={state.action === "save"}
          onSelect={(icon) => logic.chooseIcon({ icon })}
          onClose={() => logic.closeIconPicker()}
        />
      )}
    </section>
  );
}
