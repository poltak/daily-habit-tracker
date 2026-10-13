import { create, html, set } from "./dom.js";
import { createIconPickerSlot } from "./icon-picker.js";
import { icon, resolveActiveActivityGroupId } from "./ui.js";

/** @import { Activity } from "../lib/daylio.js" */
/** @import { App } from "./app.js" */

/** The form that adds one activity to a group. @param {App} app */
export function createAddActivityView(app) {
  const { state } = app;
  const data = () => /** @type {NonNullable<typeof state.data>} */ (state.data);
  let name = "";
  let activityIcon = "category";
  let groupId = resolveActiveActivityGroupId({ groups: data().groups, requestedId: state.activityGroupId });
  let iconPickerOpen = false;
  let isSaving = false;
  /** @type {Activity | null} */
  let createdActivity = null;

  const page = create(html`
    <section class="page-section activity-create-page">
      <div class="page-intro activity-create-intro">
        <button class="back-button" data-action="activity-back"></button>
        <div class="activity-create-title">
          <span class="goal-detail-icon"></span>
          <div>
            <p class="eyebrow">Activities</p>
            <h1>Add new activity</h1>
            <p class="muted">Add something you want to include in your daily check-in.</p>
          </div>
        </div>
      </div>
      <form class="settings-card goal-config-card activity-create-card" data-action="activity-create">
        <div class="section-heading">
          <div>
            <p class="eyebrow">New activity</p>
            <h2>What should we call it?</h2>
          </div>
        </div>
        <label class="goal-config-field">
          <span>Name</span>
          <input placeholder="Activity name" required data-action="activity-name">
        </label>
        <label class="goal-config-field">
          <span>Activity group</span>
          <select aria-label="Activity group" data-action="activity-group"></select>
        </label>
        <div class="goal-icon-setting">
          <span>Icon</span>
          <button type="button" class="goal-icon-button" aria-label="Choose activity icon" data-action="activity-icon"></button>
        </div>
        <div class="goal-config-actions activity-create-actions">
          <button type="submit" class="primary-button"></button>
          <button type="button" class="secondary-button" data-action="activity-back">Cancel</button>
        </div>
      </form>
    </section>`);
  /** @param {string} selector @returns {any} */
  const find = (selector) => page.querySelector(selector);
  const backButton = find(".back-button");
  const titleIcon = find(".goal-detail-icon");
  const form = find("form");
  const nameInput = find("input");
  const groupSelect = find("select");
  const iconButton = find(".goal-icon-button");
  const submitButton = find('[type="submit"]');
  const cancelButton = find(".secondary-button");

  const iconPicker = createIconPickerSlot({
    parent: () => page,
    onClose: () => {
      iconPickerOpen = false;
      app.invalidate();
    },
    onSelect: (nextIcon) => {
      activityIcon = nextIcon;
      iconPickerOpen = false;
      app.invalidate();
    },
  });

  const selectedGroupId = () => resolveActiveActivityGroupId({ groups: data().groups, requestedId: groupId || state.activityGroupId });

  function update() {
    const activeGroups = data().groups.filter((group) => !group.archived);
    const locked = isSaving || Boolean(createdActivity);
    set(backButton, { disabled: isSaving, html: html`${icon("arrow_back")} ${state.activityReturnView === "settings" ? "Setup" : "Log"}` });
    set(titleIcon, { html: icon(activityIcon) });
    set(form, { "aria-busy": isSaving });
    set(nameInput, { value: name, disabled: locked });
    set(groupSelect, {
      html: activeGroups.length === 0 ? html`<option value="">No active groups available</option>` : activeGroups.map((group) => html`<option value="${group.id}">${group.name}</option>`),
      value: selectedGroupId(),
      disabled: locked || activeGroups.length === 0,
    });
    set(iconButton, { disabled: locked, html: html`${icon(activityIcon)}<span>Change icon</span>` });
    set(submitButton, {
      disabled: isSaving || (!createdActivity && activeGroups.length === 0),
      "aria-busy": isSaving,
      text: isSaving ? (createdActivity ? "Refreshing…" : "Adding…") : (createdActivity ? "Retry refresh" : "Add activity"),
    });
    set(cancelButton, { disabled: isSaving });
    iconPicker.update(iconPickerOpen ? { activityName: name || "your new activity", currentIcon: activityIcon, isSaving } : null);
  }

  /** @param {SubmitEvent} event */
  async function submit(event) {
    event.preventDefault();
    if (isSaving) return;
    const activityName = name.trim();
    const activeGroupId = selectedGroupId();
    if (!createdActivity && !activityName) {
      app.set({ message: { kind: "error", text: "Activity name is required." } });
      return;
    }
    if (!createdActivity && !activeGroupId) {
      app.set({ message: { kind: "error", text: "Create an active activity group before adding an activity." } });
      return;
    }
    if (!navigator.onLine) {
      app.set({ message: { kind: "error", text: "You’re offline. Reconnect before adding an activity." } });
      return;
    }
    isSaving = true;
    app.set({ isActivityCreateBusy: true, message: { kind: "info", text: createdActivity ? "Refreshing activities…" : "Adding activity…" } });
    try {
      if (!createdActivity) {
        const response = await fetch("/api/catalog", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind: "activity", name: activityName, groupId: activeGroupId, icon: activityIcon }),
        });
        const result = /** @type {{ activity?: Activity; error?: string }} */ (await response.json());
        if (!response.ok || !result.activity) throw new Error(result.error ?? "Could not add activity.");
        createdActivity = result.activity;
      }
      try {
        await app.loadBootstrap();
      } catch (error) {
        app.set({ message: { kind: "error", text: `Activity created. Use Retry refresh to load it. ${/** @type {Error} */ (error).message}` } });
        return;
      }
      app.closeAddActivity({ kind: "success", text: "Activity added." });
    } catch (error) {
      app.set({ message: { kind: "error", text: /** @type {Error} */ (error).message } });
    } finally {
      isSaving = false;
      app.set({ isActivityCreateBusy: false });
    }
  }

  return {
    nodes: [page],
    update,
    // The name field takes the focus when the view opens.
    mounted: () => nameInput.focus(),
    destroy: () => iconPicker.update(null),
    handlers: {
      click: {
        "activity-back": () => app.closeAddActivity(),
        "activity-icon": () => {
          iconPickerOpen = true;
          app.invalidate();
        },
      },
      input: {
        "activity-name": (/** @type {HTMLInputElement} */ input) => {
          name = input.value;
          app.invalidate();
        },
      },
      change: {
        "activity-group": (/** @type {HTMLSelectElement} */ select) => {
          groupId = select.value;
          app.invalidate();
        },
      },
      submit: {
        "activity-create": (/** @type {HTMLFormElement} */ _form, /** @type {SubmitEvent} */ event) => void submit(event),
      },
    },
  };
}
