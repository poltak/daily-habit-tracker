import { WEEKDAY_NAMES, goalRepeatType, goalWeekdayMask, logicalDateFromDate } from "../lib/daylio.js";
import { UI_ICONS } from "../lib/icons.js";
import { attrs, create, html, place, set } from "./dom.js";
import { createIconPickerSlot } from "./icon-picker.js";
import { actionIcon, icon, monthGrid, shortDate } from "./ui.js";

/** @import { GoalHistory, GoalRepeatType } from "../lib/daylio.js" */
/** @import { App } from "./app.js" */

/** @param {GoalHistory["weeks"][number]["status"]} status */
function statusLabel(status) {
  return status === "accomplished" ? "Accomplished" : status === "not_accomplished" ? "Not accomplished" : status === "in_progress" ? "In progress" : "Upcoming";
}

/** Shown when the open goal is not in the catalog. @param {App} app */
function createMissingGoalView(app) {
  const page = create(html`
    <section class="page-section">
      <button class="ghost-button" data-action="goal-back">Back to goals</button>
      <p class="empty-inline">That goal is no longer available.</p>
    </section>`);
  return {
    nodes: [page],
    update: () => set(/** @type {Element} */ (page.firstElementChild), { disabled: app.state.isSavingGoalConfig }),
    handlers: { click: { "goal-back": () => app.closeGoal() } },
  };
}

/** One goal: its settings, its month of completed days, and its weekly results. @param {App} app */
export function createGoalView(app) {
  const { state } = app;
  const findGoal = () => state.data?.goals.find((candidate) => candidate.id === state.selectedGoalId) ?? null;
  if (!findGoal()) return createMissingGoalView(app);

  const weekdays = WEEKDAY_NAMES.map((name) => name.slice(0, 3));
  const page = create(html`
    <section class="page-section goal-detail-page">
      <div class="page-intro goal-detail-intro">
        <button class="back-button" data-action="goal-back">${icon("arrow_back")} Goals</button>
        <div class="goal-detail-title">
          <span class="goal-detail-icon"></span>
          <div>
            <p class="eyebrow">Goal history</p>
            <h1></h1>
            <p class="muted">Completed days and weekly progress for this goal.</p>
          </div>
        </div>
      </div>
      <section class="settings-card goal-config-card">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Goal settings</p>
            <h2>Repeat, activity, and icon</h2>
            <p class="muted small-copy">Choose when this goal is expected, and optionally link it to an activity.</p>
          </div>
        </div>
        <label class="goal-config-field">
          <span>Name</span>
          <input data-action="goal-name">
        </label>
        <div class="goal-config-row">
          <label class="goal-config-field">
            <span>Repeat</span>
            <select aria-label="Repeat" data-action="goal-repeat">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>
          <div class="goal-icon-setting">
            <span>Icon</span>
            <button class="goal-icon-button" aria-label="Choose goal icon" data-action="goal-icon"></button>
          </div>
        </div>
        <label class="goal-config-field">
          <span>Associated activity</span>
          <select aria-label="Associated activity" data-action="goal-activity"></select>
        </label>
        <div class="goal-config-actions">
          <button class="primary-button" data-action="goal-save"></button>
        </div>
        <div class="goal-config-actions goal-manage-actions">
          <button class="secondary-button compact-button" data-action="goal-archive"></button>
          <button class="ghost-button danger compact-button" data-action="goal-delete"></button>
          <span class="muted small-copy">Archive hides the goal and keeps its history. Delete removes the goal and its history for good.</span>
        </div>
      </section>
      <section class="calendar-card goal-history-card">
        <div class="calendar-heading">
          <button class="icon-button" aria-label="Previous month" data-action="goal-month" data-shift="-1"></button>
          <h2></h2>
          <button class="icon-button" aria-label="Next month" data-action="goal-month" data-shift="1"></button>
        </div>
        <p class="muted goal-history-explainer"></p>
        <div class="calendar-weekdays"></div>
        <div class="calendar-grid goal-calendar-grid"></div>
        <div class="calendar-legend goal-calendar-legend">
          <span><i class="legend-dot goal-completed"></i> Completed</span>
          <span><i class="legend-dot goal-not-completed"></i> Not completed</span>
        </div>
      </section>
      <section class="goal-week-history" aria-live="polite"></section>
    </section>`);
  const weekdayPicker = create(html`
    <fieldset class="weekday-picker">
      <legend>Days expected</legend>
      <div class="weekday-options">
        ${weekdays.map((weekday, index) => html`<label class="weekday-option"><input type="checkbox" data-action="goal-weekday" data-index="${index}"><span>${weekday}</span></label>`)}
      </div>
      <small class="muted">Select at least one day.</small>
    </fieldset>`);
  const targetPicker = create(html`
    <fieldset class="weekly-target-picker">
      <legend>Days per week</legend>
      <div class="weekly-target-options">
        ${Array.from({ length: 7 }, (_, index) => index + 1).map((count) => html`<label class="weekly-target-option"><input type="radio" name="goal-target-per-week" value="${count}" data-action="goal-target"><span>${count === 7 ? "Every day" : `${count} ${count === 1 ? "day" : "days"} per week`}</span></label>`)}
      </div>
    </fieldset>`);
  const archivedNote = create(html`<small class="muted">This activity is archived but remains linked.</small>`);
  const dirtyNote = create(html`<span class="muted small-copy">Unsaved goal changes</span>`);
  const historyLoading = create(html`<p class="calendar-loading" role="status">Checking this month…</p>`);

  /** @param {string} selector @returns {any} */
  const find = (selector) => page.querySelector(selector);
  const backButton = find(".back-button");
  const titleIcon = find(".goal-detail-icon");
  const title = find("h1");
  const configCard = find(".goal-config-card");
  const nameInput = find('[data-action="goal-name"]');
  const repeatSelect = find('[data-action="goal-repeat"]');
  const iconButton = find(".goal-icon-button");
  const activitySelect = find('[data-action="goal-activity"]');
  const saveActions = find(".goal-config-actions");
  const saveButton = find('[data-action="goal-save"]');
  const archiveButton = find('[data-action="goal-archive"]');
  const deleteButton = find('[data-action="goal-delete"]');
  const historyCard = find(".goal-history-card");
  const [previousMonth, monthLabel, nextMonth] = find(".calendar-heading").children;
  const explainer = find(".goal-history-explainer");
  const weekdayRow = find(".calendar-weekdays");
  const grid = find(".goal-calendar-grid");
  const legend = find(".goal-calendar-legend");
  const weekHistory = find(".goal-week-history");
  const weekdayOptions = /** @type {HTMLLabelElement[]} */ ([...weekdayPicker.querySelectorAll("label")]);
  const targetOptions = /** @type {HTMLLabelElement[]} */ ([...targetPicker.querySelectorAll("label")]);

  const iconPicker = createIconPickerSlot({
    parent: () => page,
    onClose: () => app.set({ goalIconPickerOpen: false }),
    onSelect: (materialIcon) => app.set({ goalConfigDraft: state.goalConfigDraft && { ...state.goalConfigDraft, materialIcon }, goalIconPickerOpen: false }),
  });

  const resolvedMonth = () => /^\d{4}-\d{2}$/.test(state.goalHistoryMonth) ? state.goalHistoryMonth : logicalDateFromDate().slice(0, 7);

  function update() {
    const goal = findGoal();
    const config = state.goalConfigDraft;
    const data = /** @type {NonNullable<typeof state.data>} */ (state.data);
    if (!goal || !config) return;
    const { goalHistory: history, isLoadingGoalHistory: isLoadingHistory, isSavingGoalConfig: isSavingConfig, goalAction: pendingAction } = state;
    const month = resolvedMonth();
    // While another month loads, or if that load fails, the previous month's results must not show under the new month.
    const monthHistory = history?.month === month ? history : null;
    const historyDays = new Map((monthHistory?.days ?? []).map((day) => [day.logicalDate, day]));
    // The calendar rows line up with the weekly results below.
    const { cells, label, weekdays: calendarWeekdays } = monthGrid({ month, weekEndsOn: data.settings.weekEndsOn });
    const linkedActivity = data.activities.find((activity) => activity.id === config.activityId);
    const activityOptions = data.activities.filter((activity) => !activity.archived || activity.id === config.activityId);
    const isDirty = config.name !== goal.name || config.activityId !== goal.activityId || config.materialIcon !== goal.materialIcon || config.repeatType !== goalRepeatType(goal) || config.weekdaysMask !== goalWeekdayMask(goal) || config.targetPerWeek !== Math.min(7, Math.max(1, goal.targetPerWeek ?? 1));

    set(backButton, { disabled: isSavingConfig });
    set(titleIcon, { html: icon(goal.materialIcon) });
    set(title, { text: goal.name });

    set(configCard, { "aria-busy": isSavingConfig });
    set(nameInput, { value: config.name, disabled: isSavingConfig });
    set(repeatSelect, { value: config.repeatType, disabled: isSavingConfig });
    set(iconButton, { disabled: isSavingConfig, html: html`${icon(config.materialIcon)}<span>Change icon</span>` });
    set(activitySelect, {
      html: html`<option value="">No associated activity</option>${activityOptions.map((activity) => html`<option value="${activity.id}">${activity.name}${activity.archived ? " (archived)" : ""}</option>`)}`,
      value: config.activityId ?? "",
      disabled: isSavingConfig,
    });
    place({ node: archivedNote, present: Boolean(linkedActivity?.archived), parent: activitySelect.parentNode });

    const isDaily = config.repeatType === "daily";
    place({ node: weekdayPicker, present: isDaily, parent: configCard, before: saveActions });
    place({ node: targetPicker, present: !isDaily, parent: configCard, before: saveActions });
    set(weekdayPicker, { disabled: isSavingConfig });
    set(targetPicker, { disabled: isSavingConfig });
    weekdayOptions.forEach((option, index) => {
      const selected = Boolean(config.weekdaysMask & (1 << index));
      set(option, { class: `weekday-option ${selected ? "selected" : ""}` });
      set(/** @type {Element} */ (option.firstElementChild), { checked: selected });
    });
    targetOptions.forEach((option, index) => {
      const selected = config.targetPerWeek === index + 1;
      set(option, { class: `weekly-target-option ${selected ? "selected" : ""}` });
      set(/** @type {Element} */ (option.firstElementChild), { checked: selected });
    });

    const isSaving = isSavingConfig && !pendingAction;
    set(saveButton, { disabled: isSavingConfig || !isDirty, "aria-busy": isSaving, text: isSaving ? "Saving…" : "Save goal" });
    place({ node: dirtyNote, present: isDirty && !isSavingConfig, parent: saveActions });
    set(archiveButton, { disabled: isSavingConfig, "aria-busy": pendingAction === "archive", html: html`${actionIcon(UI_ICONS.archive, pendingAction === "archive")} ${pendingAction === "archive" ? "Archiving…" : "Archive goal"}` });
    set(deleteButton, { disabled: isSavingConfig, "aria-busy": pendingAction === "delete", html: html`${actionIcon(UI_ICONS.delete, pendingAction === "delete")} ${pendingAction === "delete" ? "Deleting…" : "Delete goal"}` });

    set(historyCard, { "aria-busy": isLoadingHistory });
    set(previousMonth, { "aria-busy": isLoadingHistory, disabled: isLoadingHistory, html: actionIcon("chevron_left", isLoadingHistory) });
    set(monthLabel, { text: label });
    set(nextMonth, { "aria-busy": isLoadingHistory, disabled: isLoadingHistory, html: actionIcon("chevron_right", isLoadingHistory) });
    set(explainer, { text: goalRepeatType(goal) === "daily" ? "Green days are completed; pale days are not completed. A dash marks an expected day." : `Green days are completed. Each week needs ${goal.targetPerWeek ?? 1} completed ${(goal.targetPerWeek ?? 1) === 1 ? "day" : "days"}.` });
    set(weekdayRow, { html: calendarWeekdays.map((weekday) => html`<span>${weekday}</span>`) });
    set(grid, {
      html: cells.map((date) => {
        if (!date) return html`<span class="calendar-blank"></span>`;
        const day = historyDays.get(date);
        const dayState = day?.completed ? "completed" : "not-completed";
        return html`<div class="calendar-day goal-day ${dayState}"${attrs({ "aria-label": `${date}: ${dayState.replaceAll("-", " ")}${day?.scheduled ? ", expected" : ""}` })}><span>${Number(date.slice(-2))}</span>${day?.scheduled ? icon(day.completed ? UI_ICONS.check : "remove") : ""}</div>`;
      }),
    });
    place({ node: historyLoading, present: isLoadingHistory, parent: historyCard, before: legend });

    set(weekHistory, {
      html: html`
        <div class="section-heading"><div><p class="eyebrow">Weekly result</p><h2>Was the goal accomplished?</h2></div></div>
        ${!monthHistory && isLoadingHistory ? html`<p class="inline-loading">Loading weekly results…</p>` : monthHistory?.weeks.map((week) => html`
          <div class="goal-week-row ${week.status}">
            <span class="goal-week-status ${week.status}" aria-label="${statusLabel(week.status)}">${icon(week.status === "accomplished" ? UI_ICONS.check : week.status === "not_accomplished" ? "close" : week.status === "upcoming" ? "event" : "hourglass_top")}</span>
            <span class="goal-week-copy"><strong>${shortDate(week.weekStart)} – ${shortDate(week.weekEnd)}</strong><small>${statusLabel(week.status)} · ${week.completedCount}/${week.expectedCount} ${week.repeatType === "daily" ? "scheduled days" : "days"}</small></span>
          </div>`)}`,
    });

    iconPicker.update(state.goalIconPickerOpen ? { activityName: config.name || goal.name, itemType: "Goal", currentIcon: config.materialIcon, isSaving: isSavingConfig } : null);
  }

  /** @param {Partial<NonNullable<typeof state.goalConfigDraft>>} patch */
  function patchConfig(patch) {
    if (state.goalConfigDraft) app.set({ goalConfigDraft: { ...state.goalConfigDraft, ...patch } });
  }

  return {
    nodes: [page],
    update,
    destroy: () => iconPicker.update(null),
    handlers: {
      click: {
        "goal-back": () => app.closeGoal(),
        "goal-icon": () => app.set({ goalIconPickerOpen: true }),
        "goal-save": () => void app.saveGoalConfig(),
        "goal-archive": () => void app.retireGoal("archive"),
        "goal-delete": () => void app.retireGoal("delete"),
        "goal-month": (/** @type {HTMLElement} */ button) => {
          const data = /** @type {NonNullable<typeof state.data>} */ (state.data);
          app.set({ goalHistoryMonth: monthGrid({ month: resolvedMonth(), weekEndsOn: data.settings.weekEndsOn }).shifted(Number(button.dataset.shift)) });
        },
      },
      input: {
        "goal-name": (/** @type {HTMLInputElement} */ input) => patchConfig({ name: input.value }),
      },
      change: {
        "goal-repeat": (/** @type {HTMLSelectElement} */ select) => patchConfig({ repeatType: /** @type {GoalRepeatType} */ (select.value) }),
        "goal-activity": (/** @type {HTMLSelectElement} */ select) => patchConfig({ activityId: select.value || null }),
        "goal-weekday": (/** @type {HTMLInputElement} */ input) => patchConfig({ weekdaysMask: (state.goalConfigDraft?.weekdaysMask ?? 0) ^ (1 << Number(input.dataset.index)) }),
        "goal-target": (/** @type {HTMLInputElement} */ input) => patchConfig({ targetPerWeek: Number(input.value) }),
      },
    },
  };
}
