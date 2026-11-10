import { useMemo } from "react";
import { useLogic } from "../../core/logic/use-logic.js";
import { useFrontendApp } from "../../core/ui/frontend-app-context.js";
import type { NoticeTarget } from "../types.js";
import { CatalogNotice } from "./catalog-notice.js";
import { GoalSetupCard } from "./goal-setup-card.js";
import { GoalSetupLogic } from "./goal-setup-logic.js";
import { IconPicker } from "./icon-picker.js";
import "./catalog.css";

interface GoalSettingsProps {
  goalId: string;
  returnTo: NoticeTarget;
  /** Go back to the page that opened the goal. */
  onClose: () => void;
}

/** The settings of one goal: name, repeat, activity, icon, archive and delete. The goal page shows them above its history. */
export function GoalSettings({ goalId, returnTo, onClose }: GoalSettingsProps) {
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
  if (!state.goal) {
    return <CatalogNotice notice={state.notice} />;
  }
  return (
    <>
      <CatalogNotice notice={state.notice} />
      <GoalSetupCard
        logic={logic}
        state={state}
        onArchive={() => void logic.archive().then((done) => done && onClose())}
        onRemove={() => void logic.remove().then((done) => done && onClose())}
      />
      {state.iconPickerOpen && (
        <IconPicker
          kind="Goal"
          subject={state.name || state.goal.name}
          currentIcon={state.materialIcon}
          isSaving={state.action === "save"}
          onSelect={(icon) => logic.chooseIcon({ icon })}
          onClose={() => logic.closeIconPicker()}
        />
      )}
    </>
  );
}
