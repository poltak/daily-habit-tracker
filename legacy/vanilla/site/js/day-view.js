import { ALL_WEEKDAYS_MASK, goalRepeatType, goalWeekdayMask } from "../lib/daylio.js";
import { filterActivityGroups } from "../lib/activity-groups.js";
import { UI_ICONS } from "../lib/icons.js";
import { create, html, place, set, syncChildren } from "./dom.js";
import { friendlyDate, getEntryForDate, icon, longDate, memo, moodFace, noticeText } from "./ui.js";

/** @import { Activity, ActivityGroup, Goal, Mood } from "../lib/daylio.js" */
/** @import { App } from "./app.js" */

const GROUP_ICONS = /** @type {Record<string, string>} */ ({
  social: "diversity_3",
  hobbies: "toys_and_games",
  health: "favorite",
  study: "menu_book",
  productivity: "work",
  vices: "favorite",
  everyday: "door_open",
  substances: "nutrition",
  emotions: "adjust",
  people: "group",
  work: "business_center",
  home: "home",
  leisure: "sports_esports",
});

const EMPTY_SELECTION = Symbol("empty selection");

/** The daily entry form: goals, mood, activities and the save panel. @param {App} app */
export function createLogView(app) {
  const { state } = app;
  const filteredGroups = memo();
  /** For each group, whether a search was in progress when the view last set its open state. @type {WeakMap<Element, boolean>} */
  const searchOpened = new WeakMap();

  const form = create(html`
    <fieldset class="log-form">
      <legend class="sr-only">Daily entry form</legend>
      <section class="hero-card">
        <div>
          <p class="eyebrow">Your daily check-in</p>
          <h1></h1>
          <p class="muted">Take a breath. Unclench.</p>
        </div>
      </section>
      <section class="panel goals-panel">
        <div class="section-heading">
          <h2>Goals</h2>
          <span class="section-count" aria-label="Completed goals"></span>
        </div>
        <div class="goal-list"></div>
      </section>
      <section class="panel mood-panel">
        <div class="section-heading">
          <h2>Overall mood</h2>
          <span class="required-label">required</span>
        </div>
        <div class="mood-grid"></div>
      </section>
      <section class="panel activities-panel">
        <div class="section-heading">
          <h2>Activities</h2>
          <span class="selection-count"></span>
        </div>
        <div class="selection-row" role="group" aria-label="Selected activities"></div>
        <label class="search-field">
          ${icon(UI_ICONS.search)}
          <input placeholder="Search your activities" aria-label="Search activities" data-action="activity-query">
        </label>
      </section>
    </fieldset>`);
  const saveBar = create(html`
    <div class="save-bar">
      <div><strong></strong><span></span></div>
      <div class="save-actions"><button class="primary-button" data-action="save-entry"></button></div>
    </div>`);

  /** @param {string} selector @returns {any} */
  const find = (selector) => form.querySelector(selector);
  const hero = find(".hero-card");
  const heading = find("h1");
  const goalsPanel = find(".goals-panel");
  const goalCount = find(".section-count");
  const goalList = find(".goal-list");
  const moodGrid = find(".mood-grid");
  const activitiesPanel = find(".activities-panel");
  const selectionCount = find(".selection-count");
  const selectionRow = find(".selection-row");
  const search = find(".search-field input");
  const [saveCopy, saveActions] = /** @type {HTMLElement[]} */ ([...saveBar.children]);
  const [saveTitle, saveDetail] = /** @type {HTMLElement[]} */ ([...saveCopy.children]);
  const saveButton = /** @type {HTMLElement} */ (saveActions.firstElementChild);

  // The parts that show only in some states.
  const formStatus = create(html`<p class="sr-only" role="status"></p>`);
  const selectionStatus = create(html`<p class="sr-only" role="status">Saving your mood or activity selection…</p>`);
  const notice = create(html`<div role="status"></div>`);
  const retryButton = create(html`<button class="secondary-button" data-action="retry-day">Retry day</button>`);
  const dayLoading = create(html`<div class="inline-loading" role="status">Loading this day’s selections…</div>`);
  const groupList = create(html`<div class="activity-groups"></div>`);
  const noMatches = create(html`<p class="empty-inline">No activities match that search.</p>`);
  const deleteButton = create(html`<button class="ghost-button danger" data-action="delete-entry"></button>`);

  function update() {
    const { selectedDate, draft, activityQuery, isLoadingDate, isSaving, isDeleting, pendingGoalKeys, pendingSelectionKeys, message } = state;
    const data = /** @type {NonNullable<typeof state.data>} */ (state.data);
    const isDateReady = state.loadedDate === selectedDate && Boolean(selectedDate);
    const existing = getEntryForDate(data.entries, selectedDate);
    const groups = filteredGroups([activityQuery, data.activities, data.groups], () => filterActivityGroups({ groups: data.groups, activities: data.activities, query: activityQuery }));
    const activeGoals = data.goals.filter((goal) => !goal.archived);
    const formBusy = isSaving || isDeleting;
    const dayPrefix = `${selectedDate}:`;
    const goalsBusy = [...pendingGoalKeys].some((key) => key.startsWith(dayPrefix));
    const selectionBusy = [...pendingSelectionKeys].some((key) => key.startsWith(dayPrefix));
    const dayUnavailable = isLoadingDate || !isDateReady;
    const completedGoalIds = new Set(draft.completedGoalIds);
    const selectedActivityIds = new Set(draft.activityIds);
    const activitiesById = new Map(data.activities.map((activity) => [activity.id, activity]));

    set(form, { disabled: formBusy, "aria-busy": formBusy });
    set(formStatus, { text: `Daily entry form disabled while ${isDeleting ? "deleting" : "saving"}.` });
    place({ node: selectionStatus, present: selectionBusy, parent: form, before: hero });
    place({ node: formStatus, present: formBusy, parent: form, before: selectionBusy ? selectionStatus : hero });
    set(heading, { text: selectedDate === data.today ? "How was your day?" : selectedDate === data.yesterday ? "How was yesterday?" : `How was ${longDate(selectedDate)}?` });

    const showRetry = !isLoadingDate && !isDateReady;
    place({ node: retryButton, present: showRetry, parent: form, before: goalsPanel });
    if (message) set(notice, { class: `notice ${message.kind}`, text: noticeText(message) });
    place({ node: notice, present: Boolean(message), parent: form, before: showRetry ? retryButton : goalsPanel });

    // Goals
    set(goalsPanel, { "aria-busy": isLoadingDate || goalsBusy });
    set(goalCount, { text: `${activeGoals.filter((goal) => completedGoalIds.has(goal.id)).length}/${activeGoals.length}` });
    syncChildren({
      parent: goalList,
      items: activeGoals,
      key: (goal) => goal.id,
      create: () => create(html`
        <div class="goal-row">
          <button class="goal-checkbox" data-action="toggle-goal"></button>
          <button class="goal-main" data-action="open-goal">
            <span class="goal-copy"><strong></strong><small></small></span>
            <span class="goal-arrow">${icon("chevron_right")}</span>
          </button>
        </div>`),
      update: (row, goal) => updateGoalRow({
        row,
        goal,
        activity: activitiesById.get(goal.activityId ?? ""),
        checked: completedGoalIds.has(goal.id),
        pending: pendingGoalKeys.has(`${selectedDate}:${goal.id}`),
        disabled: dayUnavailable,
      }),
    });

    // Mood
    const moodPending = pendingSelectionKeys.has(`${selectedDate}:mood:`);
    set(moodGrid, { "aria-busy": isLoadingDate || selectionBusy });
    syncChildren({
      parent: moodGrid,
      items: data.moods,
      // A mood whose face or name changes gets a new button.
      key: (mood) => `${mood.id}|${mood.score}|${mood.color}|${mood.name}`,
      create: (mood) => create(html`<button data-action="mood" data-id="${mood.id}">${moodFace({ score: mood.score, color: mood.color, svgAttributes: { class: "mood-emoji" } })}<span>${mood.name}</span></button>`),
      update: (button, mood) => set(button, {
        class: `mood-option ${draft.moodId === mood.id ? "selected" : ""}`,
        style: { "--mood-color": mood.color },
        "aria-pressed": draft.moodId === mood.id,
        "aria-busy": moodPending,
        disabled: dayUnavailable || moodPending,
      }),
    });

    // Activities
    set(activitiesPanel, { "aria-busy": isLoadingDate || selectionBusy });
    set(selectionCount, { text: `${draft.activityIds.length} selected` });
    /** @type {Array<Activity | typeof EMPTY_SELECTION>} */
    const chips = draft.activityIds.length === 0 ? [EMPTY_SELECTION] : draft.activityIds.flatMap((id) => activitiesById.get(id) ?? []);
    syncChildren({
      parent: selectionRow,
      items: chips,
      key: (chip) => chip === EMPTY_SELECTION ? "" : `activity:${chip.id}`,
      create: (chip) => chip === EMPTY_SELECTION
        ? create(html`<span class="selection-empty">Selected activities appear here.</span>`)
        : create(html`<button class="selection-chip" data-action="toggle-activity" data-id="${chip.id}"></button>`),
      update: (button, chip) => {
        if (chip === EMPTY_SELECTION) return;
        const pending = pendingSelectionKeys.has(`${selectedDate}:activity:${chip.id}`);
        set(button, { disabled: dayUnavailable || pending, "aria-busy": pending, html: html`${icon(chip.icon)} ${chip.name} <span>${icon(UI_ICONS.close)}</span>` });
      },
    });
    set(search, { value: activityQuery });

    const hasQuery = activityQuery.trim().length > 0;
    const hasGroups = groups.length > 0;
    place({ node: groupList, present: hasGroups, parent: activitiesPanel });
    place({ node: noMatches, present: !hasGroups, parent: activitiesPanel });
    place({ node: dayLoading, present: isLoadingDate, parent: activitiesPanel, before: hasGroups ? groupList : noMatches });
    syncChildren({
      parent: groupList,
      items: groups,
      key: ({ group }) => group.id,
      create: () => create(html`
        <details>
          <summary>
            <span class="group-title"></span>
            <span class="group-summary-meta">
              <button type="button" class="add-activity-button" data-action="add-activity">+ Add new</button>
              <span></span>
              ${icon("expand_more", "group-expand-icon")}
            </span>
          </summary>
          <div class="activity-grid"></div>
        </details>`),
      update: (details, { group, activities }) => {
        const [summary, grid] = details.children;
        const [title, meta] = summary.children;
        const [addButton, count] = meta.children;
        // A search opens each group, and the end of a search closes each group. In between, the person's choice stays.
        if (searchOpened.get(details) !== hasQuery) {
          details.open = hasQuery;
          searchOpened.set(details, hasQuery);
        }
        set(title, { html: html`<span class="group-icon">${icon(GROUP_ICONS[group.name.toLowerCase()] ?? "category")}</span>${group.name}` });
        set(addButton, { "aria-label": `Add new activity to ${group.name}`, "data-group": group.id });
        set(count, { text: `${activities.length} ${activities.length === 1 ? "activity" : "activities"}` });
        syncChildren({
          parent: grid,
          items: activities,
          key: (activity) => activity.id,
          create: (activity) => create(html`<button data-action="toggle-activity" data-id="${activity.id}"><span class="activity-icon"></span><span></span></button>`),
          update: (button, activity) => {
            const selected = selectedActivityIds.has(activity.id);
            const pending = pendingSelectionKeys.has(`${selectedDate}:activity:${activity.id}`);
            const [activityIcon, name, checkMark] = button.children;
            set(button, { class: `activity-button ${selected ? "selected" : ""}`, "aria-pressed": selected, "aria-busy": pending, disabled: dayUnavailable || pending });
            set(activityIcon, { html: icon(activity.icon) });
            set(name, { text: activity.name });
            if (selected && !checkMark) button.appendChild(create(html`<span class="check-mark">${icon(UI_ICONS.check)}</span>`));
            else if (!selected && checkMark) checkMark.remove();
          },
        });
      },
    });

    // Save panel
    const activityCount = draft.activityIds.length;
    const saveBlocked = isSaving || isDeleting || !isDateReady || goalsBusy || selectionBusy;
    set(saveBar, { "aria-busy": formBusy || goalsBusy || selectionBusy });
    set(saveTitle, { text: existing ? "Your entry is saved" : "Ready to save your day?" });
    set(saveDetail, { text: `${friendlyDate(selectedDate)} · ${activityCount} ${activityCount === 1 ? "activity" : "activities"}` });
    place({ node: deleteButton, present: Boolean(existing), parent: saveActions, before: saveButton });
    set(deleteButton, { disabled: saveBlocked, "aria-busy": isDeleting, text: isDeleting ? "Deleting…" : "Delete" });
    set(saveButton, { class: `primary-button${existing ? " is-saved" : ""}`, disabled: Boolean(existing) || saveBlocked, "aria-busy": isSaving, text: existing ? "Saved" : "Save entry" });
  }

  return {
    nodes: [form, saveBar],
    update,
    handlers: {
      click: {
        "retry-day": () => void app.chooseDate(state.selectedDate),
        "toggle-goal": (/** @type {HTMLElement} */ button) => void app.toggleGoal(button.dataset.id ?? ""),
        "open-goal": (/** @type {HTMLElement} */ button) => app.openGoal(button.dataset.id ?? ""),
        mood: (/** @type {HTMLElement} */ button) => void app.toggleMood(button.dataset.id ?? ""),
        "toggle-activity": (/** @type {HTMLElement} */ button) => void app.toggleActivity(button.dataset.id ?? ""),
        "add-activity": (/** @type {HTMLElement} */ button, /** @type {Event} */ event) => {
          // The button is inside the group's summary. Its click must not open or close the group.
          event.preventDefault();
          app.changeView("add-activity", { groupId: button.dataset.group, returnView: "log" });
        },
        "save-entry": () => void app.saveEntry(),
        "delete-entry": () => void app.deleteSelectedEntry(),
      },
      input: {
        "activity-query": (/** @type {HTMLInputElement} */ input) => app.set({ activityQuery: input.value }),
      },
    },
  };
}

/** @param {{ row: HTMLElement; goal: Goal; activity?: Activity; checked: boolean; pending: boolean; disabled: boolean }} input */
function updateGoalRow({ row, goal, activity, checked, pending, disabled }) {
  const detail = goalRepeatType(goal) === "weekly"
    ? `${goal.targetPerWeek ?? 1} ${(goal.targetPerWeek ?? 1) === 1 ? "day" : "days"} this week`
    : goalWeekdayMask(goal) === ALL_WEEKDAYS_MASK
      ? "Every day"
      : "Selected weekdays";
  const unavailable = pending || disabled;
  const [checkbox, main, status] = row.children;
  const [name, description] = main.children[0].children;
  set(row, { class: `goal-row ${checked ? "checked" : ""}`, "aria-busy": pending, "aria-disabled": unavailable });
  set(checkbox, {
    "data-id": goal.id,
    disabled: unavailable,
    "aria-label": `Mark ${goal.name} ${checked ? "not completed" : "completed"}`,
    "aria-pressed": checked,
    "aria-busy": pending,
    html: checked ? icon(UI_ICONS.check) : "",
  });
  set(main, { "data-id": goal.id, disabled: unavailable, "aria-label": `Open ${goal.name} goal` });
  set(name, { html: html`${icon(goal.materialIcon)} ${goal.name}` });
  set(description, { text: pending ? "Saving…" : disabled ? "Loading day…" : `${detail}${activity ? ` · ${activity.name}` : ""}` });
  if (pending && !status) row.appendChild(create(html`<span class="sr-only" role="status">Saving ${goal.name}…</span>`));
  else if (!pending && status) status.remove();
}
