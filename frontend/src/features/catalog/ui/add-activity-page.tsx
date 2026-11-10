import { useEffect, useMemo, useRef, type FormEvent } from "react";
import { useLogic } from "../../core/logic/use-logic.js";
import { useFrontendApp } from "../../core/ui/frontend-app-context.js";
import { MaterialIcon } from "../../core/ui/material-icon.js";
import type { NoticeTarget } from "../types.js";
import { AddActivityLogic } from "./add-activity-logic.js";
import { CatalogNotice } from "./catalog-notice.js";
import { IconPicker } from "./icon-picker.js";
import "./catalog.css";

interface AddActivityPageProps {
  requestedGroupId: string | undefined;
  returnTo: NoticeTarget;
  /** Go back to the page that opened the form. */
  onClose: () => void;
}

/** The form that adds one activity to a group. */
export function AddActivityPage({
  requestedGroupId,
  returnTo,
  onClose,
}: AddActivityPageProps) {
  const app = useFrontendApp();
  const deps = useMemo(
    () => ({
      storage: {},
      services: { device: app.services.device },
      api: { catalog: app.api.catalog },
      catalogEvents: app.catalogEvents,
      requestedGroupId,
      returnTo,
    }),
    [app, requestedGroupId, returnTo],
  );
  const { logic, state } = useLogic({ LogicClass: AddActivityLogic, deps });
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => nameRef.current?.focus(), []);
  const activeGroups = state.groups.filter((group) => !group.archived);
  const locked = state.adding;

  function leave() {
    if (logic.canLeave()) {
      onClose();
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await logic.add()) {
      onClose();
    }
  }

  return (
    <section className="page-section activity-create-page">
      <div className="page-intro activity-create-intro">
        <button
          type="button"
          className="back-button"
          disabled={locked}
          onClick={leave}
        >
          <MaterialIcon name="arrow_back" />{" "}
          {returnTo === "settings" ? "Setup" : "Log"}
        </button>
        <div className="activity-create-title">
          <span className="goal-detail-icon">
            <MaterialIcon name={state.icon} />
          </span>
          <div>
            <p className="eyebrow">Activities</p>
            <h1>Add new activity</h1>
            <p className="muted">
              Add something you want to include in your daily check-in.
            </p>
          </div>
        </div>
      </div>
      <CatalogNotice notice={state.notice} />
      <form
        className="settings-card goal-config-card activity-create-card"
        aria-busy={locked}
        onSubmit={(event) => void submit(event)}
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">New activity</p>
            <h2>What should we call it?</h2>
          </div>
        </div>
        <label className="goal-config-field">
          <span>Name</span>
          <input
            placeholder="Activity name"
            required
            ref={nameRef}
            value={state.name}
            disabled={locked}
            onChange={(event) => logic.setName({ name: event.target.value })}
          />
        </label>
        <label className="goal-config-field">
          <span>Activity group</span>
          <select
            aria-label="Activity group"
            value={logic.groupId}
            disabled={locked || activeGroups.length === 0}
            onChange={(event) =>
              logic.chooseGroup({ groupId: event.target.value })
            }
          >
            {activeGroups.length === 0 ? (
              <option value="">No active groups available</option>
            ) : (
              activeGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))
            )}
          </select>
        </label>
        <div className="goal-icon-setting">
          <span>Icon</span>
          <button
            type="button"
            className="goal-icon-button"
            aria-label="Choose activity icon"
            disabled={locked}
            onClick={() => logic.openIconPicker()}
          >
            <MaterialIcon name={state.icon} />
            <span>Change icon</span>
          </button>
        </div>
        <div className="goal-config-actions activity-create-actions">
          <button
            type="submit"
            className="primary-button"
            aria-busy={locked}
            disabled={locked || activeGroups.length === 0}
          >
            {locked ? "Adding…" : "Add activity"}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={locked}
            onClick={leave}
          >
            Cancel
          </button>
        </div>
      </form>
      {state.iconPickerOpen && (
        <IconPicker
          kind="Activity"
          subject={state.name || "your new activity"}
          currentIcon={state.icon}
          isSaving={false}
          onSelect={(icon) => logic.chooseIcon({ icon })}
          onClose={() => logic.closeIconPicker()}
        />
      )}
    </section>
  );
}
