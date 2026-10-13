// The journal app: its state, its routes, the requests to the API, and the page shell.
// There is no framework. A change goes into `state`, and `render` then brings the page in line with it.
import { ALL_WEEKDAYS_MASK, addDays, goalRepeatType, goalWeekdayMask, isLogicalDate, logicalDateFromDate } from "../lib/daylio.js";
import { clearStoredDraft, entryInputFromDraft, readActiveStoredDraft, recoverStoredDraft, rememberDraftDate, writeStoredDraft } from "../lib/draft-storage.js";
import { deleteWarning } from "../lib/catalog-mutations.js";
import { draftFromDayRefreshState } from "../lib/day-refresh.js";
import { dayOffsetFromSwipe } from "../lib/day-swipe.js";
import { UI_ICONS } from "../lib/icons.js";
import { createLatestRequestGate } from "../lib/latest-request-gate.js";
import { createAddActivityView } from "./add-activity-view.js";
import { createCalendarView } from "./calendar-view.js";
import { create, html, place, set } from "./dom.js";
import { createGoalView } from "./goal-view.js";
import { createInsightsView } from "./insights-view.js";
import { createLogView } from "./log-view.js";
import { createSetupView } from "./setup-view.js";
import { startTheme } from "./theme.js";
import { friendlyDate, getEntryForDate, icon, noticeText, resolveActiveActivityGroupId, shortDate } from "./ui.js";

/** @import { Bootstrap, CalendarEntryDay, DaySelections, Entry, Goal, GoalHistory, GoalRepeatType } from "../lib/daylio.js" */
/** @import { Draft } from "../lib/draft-storage.js" */
/** @import { ThemePreference } from "../lib/theme.js" */
/** @import { Notice } from "./ui.js" */
/**
 * @typedef {"log" | "calendar" | "settings" | "goal" | "add-activity" | "insights"} View
 * @typedef {"log" | "settings"} ActivityCreationSource
 * @typedef {"checking" | "online" | "offline" | "error"} ConnectionState
 * @typedef {{ view: View; goalId?: string; groupId?: string; returnView?: ActivityCreationSource }} Route
 * @typedef {Bootstrap & { entries: Entry[] }} JournalData The catalog from the server plus the saved entries this session has loaded, one day at a time.
 * @typedef {{ name: string; activityId: string | null; repeatType: GoalRepeatType; weekdaysMask: number; targetPerWeek: number; materialIcon: string }} GoalConfigDraft
 * @typedef {Pick<Bootstrap, "activities" | "goals">} Catalog
 * @typedef {{ entry: Entry | null; completedGoalIds: string[]; daySelections?: DaySelections }} DayState
 * @typedef {{ nodes: Node[]; update: () => void; mounted?: () => void; destroy?: () => void; handlers: Record<string, Record<string, (element: any, event: any) => void> | undefined> }} ViewInstance
 * @typedef {typeof app} App
 */
/**
 * @typedef {object} State
 * @property {JournalData | null} data
 * @property {View} view
 * @property {string} selectedDate
 * @property {Draft} draft
 * @property {string} activityQuery
 * @property {boolean} isLoadingDate
 * @property {string} loadedDate The day whose saved state is in `draft`. It is "" while a day loads.
 * @property {boolean} isSaving
 * @property {boolean} isDeleting
 * @property {boolean} isSetupBusy
 * @property {string} calendarMonth
 * @property {CalendarEntryDay[]} calendarDays
 * @property {boolean} isLoadingCalendar
 * @property {string | null} selectedGoalId
 * @property {string} goalHistoryMonth
 * @property {GoalHistory | null} goalHistory
 * @property {number} goalHistoryRevision
 * @property {boolean} isLoadingGoalHistory
 * @property {GoalConfigDraft | null} goalConfigDraft
 * @property {boolean} isSavingGoalConfig True while a save, an archive, or a delete of the open goal is in progress.
 * @property {"archive" | "delete" | null} goalAction
 * @property {boolean} goalIconPickerOpen
 * @property {string | undefined} activityGroupId
 * @property {ActivityCreationSource} activityReturnView
 * @property {boolean} isActivityCreateBusy
 * @property {ConnectionState} connectionState
 * @property {Notice | null} message
 * @property {Set<string>} pendingGoalKeys
 * @property {Set<string>} pendingSelectionKeys
 * @property {ThemePreference} themePreference
 */

const HISTORY_STATE_KEY = "daymarkRoute";

/** @param {Location} location @returns {Route} */
function routeFromLocation(location) {
  if (location.pathname.replace(/\/$/, "") === "/insights") return { view: "insights" };
  const params = new URLSearchParams(location.search);
  const requestedView = params.get("view");
  const goalId = params.get("goal");
  if (requestedView === "goal" && goalId) return { view: "goal", goalId };
  if (requestedView === "add-activity" || requestedView === "activity") {
    return {
      view: "add-activity",
      groupId: params.get("group") ?? params.get("groupId") ?? undefined,
      returnView: params.get("from") === "settings" ? "settings" : "log",
    };
  }
  if (requestedView === "entries") return { view: "calendar" };
  if (requestedView === "calendar" || requestedView === "settings" || requestedView === "insights") {
    return { view: requestedView };
  }
  return { view: "log" };
}

/** @param {Route} route */
function routeUrl(route) {
  const url = new URL(window.location.href);
  url.pathname = route.view === "insights" ? "/insights" : "/";
  if (route.view === "log" || route.view === "insights") url.searchParams.delete("view");
  else url.searchParams.set("view", route.view);
  url.hash = "";
  if (route.view === "goal" && route.goalId) url.searchParams.set("goal", route.goalId);
  else url.searchParams.delete("goal");
  if (route.view === "add-activity") {
    if (route.groupId) url.searchParams.set("group", route.groupId);
    else url.searchParams.delete("group");
    url.searchParams.set("from", route.returnView === "settings" ? "settings" : "log");
  } else {
    url.searchParams.delete("group");
    url.searchParams.delete("groupId");
    url.searchParams.delete("from");
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/** @type {Draft} */
const EMPTY_DRAFT = {
  moodId: "",
  activityIds: [],
  completedGoalIds: [],
  localTime: "23:00",
};

/** @param {Goal} goal @returns {GoalConfigDraft} */
function goalConfigFromGoal(goal) {
  return {
    name: goal.name,
    activityId: goal.activityId,
    repeatType: goalRepeatType(goal),
    weekdaysMask: goalWeekdayMask(goal),
    targetPerWeek: Math.min(7, Math.max(1, goal.targetPerWeek ?? 1)),
    materialIcon: goal.materialIcon,
  };
}

/** @param {readonly string[]} left @param {readonly string[]} right */
function sameStringArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** @param {Draft} left @param {Draft} right */
function sameDraft(left, right) {
  return left.moodId === right.moodId
    && left.localTime === right.localTime
    && left.version === right.version
    && sameStringArray(left.activityIds, right.activityIds)
    && sameStringArray(left.completedGoalIds, right.completedGoalIds);
}

/** @param {Draft} draft @param {Entry} entry */
function sameEntrySelections(draft, entry) {
  return draft.moodId === entry.moodId
    && draft.activityIds.length === entry.activityIds.length
    && draft.activityIds.every((id) => entry.activityIds.includes(id));
}

/** @param {Entry | undefined} left @param {Entry | null} right */
function sameEntry(left, right) {
  if (!left || !right) return !left && !right;
  return left.id === right.id
    && left.localTime === right.localTime
    && left.timezone === right.timezone
    && left.timezoneOffsetMinutes === right.timezoneOffsetMinutes
    && left.moodId === right.moodId
    && left.version === right.version
    && left.createdAt === right.createdAt
    && left.updatedAt === right.updatedAt
    && left.deletedAt === right.deletedAt
    && sameStringArray(left.activityIds, right.activityIds)
    && sameStringArray(left.completedGoalIds, right.completedGoalIds);
}

/** @param {Entry | null} entry @returns {Draft} */
function draftFromEntry(entry) {
  if (!entry) return { ...EMPTY_DRAFT };
  return {
    moodId: entry.moodId,
    activityIds: [...entry.activityIds],
    completedGoalIds: [...entry.completedGoalIds],
    localTime: entry.localTime,
    version: entry.version,
  };
}

/** @param {{ logicalDate: string; serverEntry: Entry | null; serverCompletedGoalIds?: string[]; serverSelections?: DaySelections }} input */
function draftForDate({ logicalDate, serverEntry, serverCompletedGoalIds = serverEntry?.completedGoalIds ?? [], serverSelections }) {
  const recovered = recoverStoredDraft(logicalDate, serverEntry);
  const completedGoalIds = [...new Set(serverCompletedGoalIds)];
  const baseDraft = serverEntry
    ? draftFromEntry(serverEntry)
    : serverSelections
      ? {
          ...EMPTY_DRAFT,
          moodId: serverSelections.moodId ?? "",
          activityIds: [...serverSelections.activityIds],
        }
      : draftFromEntry(null);
  if (recovered) {
    const recoveredDraft = { ...recovered, completedGoalIds };
    if (serverSelections?.moodOverride) recoveredDraft.moodId = baseDraft.moodId;
    if (serverSelections && serverSelections.activityOverrideIds.length > 0) {
      const activityIds = new Set(recoveredDraft.activityIds);
      for (const activityId of serverSelections.activityOverrideIds) {
        if (serverSelections.activityIds.includes(activityId)) activityIds.add(activityId);
        else activityIds.delete(activityId);
      }
      recoveredDraft.activityIds = [...activityIds];
    }
    return { draft: recoveredDraft, restored: true };
  }
  return {
    draft: { ...baseDraft, completedGoalIds },
    restored: false,
  };
}

/**
 * Returns `record` without the activities and goals that no longer exist. The server refuses a save that names a deleted one.
 * @template {{ activityIds: string[]; completedGoalIds: string[] }} T
 * @param {{ record: T; catalog: Catalog }} input
 * @returns {T}
 */
function withKnownCatalog({ record, catalog }) {
  const activityIds = record.activityIds.filter((id) => catalog.activities.some((activity) => activity.id === id));
  const completedGoalIds = record.completedGoalIds.filter((id) => catalog.goals.some((goal) => goal.id === id));
  return activityIds.length === record.activityIds.length && completedGoalIds.length === record.completedGoalIds.length
    ? record
    : { ...record, activityIds, completedGoalIds };
}

/**
 * Returns `ids` with each toggle applied: `true` adds the id and `false` removes it.
 * @param {readonly string[]} ids
 * @param {Iterable<readonly [string, boolean]>} toggles
 */
function applyToggles(ids, toggles) {
  const next = new Set(ids);
  for (const [id, on] of toggles) {
    if (on) next.add(id);
    else next.delete(id);
  }
  return [...next];
}

/** @param {Array<{ goalId: string; completed: boolean }>} completions */
function completionToggles(completions) {
  return completions.map((completion) => /** @type {const} */ ([completion.goalId, completion.completed]));
}

/** @param {Array<{ activityId: string; selected: boolean }>} selections */
function selectionToggles(selections) {
  return selections.map((selection) => /** @type {const} */ ([selection.activityId, selection.selected]));
}

/**
 * Reads one day's saved state. A day without an entry answers 404 with the same body shape.
 * @param {{ logicalDate: string; signal: AbortSignal; errorText: string }} input
 * @returns {Promise<DayState>}
 */
async function fetchDayState({ logicalDate, signal, errorText }) {
  const response = await fetch(`/api/entries/${logicalDate}`, { cache: "no-store", signal });
  if (!response.ok && response.status !== 404) throw new Error(errorText);
  const result = /** @type {{ entry?: Entry | null; completedGoalIds?: string[]; daySelections?: DaySelections }} */ (await response.json());
  const entry = result.entry ?? null;
  return { entry, completedGoalIds: result.completedGoalIds ?? entry?.completedGoalIds ?? [], daySelections: result.daySelections };
}

/** @type {State} */
const state = {
  data: null,
  view: "log",
  selectedDate: "",
  draft: EMPTY_DRAFT,
  activityQuery: "",
  isLoadingDate: false,
  loadedDate: "",
  isSaving: false,
  isDeleting: false,
  isSetupBusy: false,
  calendarMonth: "",
  calendarDays: [],
  isLoadingCalendar: false,
  selectedGoalId: null,
  goalHistoryMonth: "",
  goalHistory: null,
  goalHistoryRevision: 0,
  isLoadingGoalHistory: false,
  goalConfigDraft: null,
  isSavingGoalConfig: false,
  goalAction: null,
  goalIconPickerOpen: false,
  activityGroupId: undefined,
  activityReturnView: "log",
  isActivityCreateBusy: false,
  connectionState: "checking",
  message: null,
  pendingGoalKeys: new Set(),
  pendingSelectionKeys: new Set(),
  themePreference: "system",
};

// Values that the page does not show.
const dateRequestGate = createLatestRequestGate();
const dayRefreshRequestGate = createLatestRequestGate();
const bootstrapRequestGate = createLatestRequestGate();
const goalHistoryRequestGate = createLatestRequestGate();
let pendingGoalConfig = false;
let goalConfigSaveSequence = 0;
/** @type {{ sequence: number; goalId: string } | null} */
let activeGoalConfigSave = null;
/** @type {Notice | null} */
let pendingRouteNotice = null;
/** @type {Set<string>} */
const failedSelections = new Set();
let hasLocalDraft = false;
let entryMutation = false;
let selectedDateEpoch = 0;
let localMutationEpoch = 0;
let navigationReady = false;
let routeDepth = 0;

let renderQueued = false;

/** Asks for one render after the current task. Each change to the state calls this. */
function invalidate() {
  if (renderQueued) return;
  renderQueued = true;
  queueMicrotask(() => {
    renderQueued = false;
    render();
  });
}

/** @param {Partial<State>} patch */
function setState(patch) {
  Object.assign(state, patch);
  invalidate();
}

/** @param {(data: JournalData) => JournalData} change */
function updateData(change) {
  if (state.data) setState({ data: change(state.data) });
}

/** @param {boolean} value */
function markLocalDraft(value) {
  hasLocalDraft = value;
}

function beginLocalMutation() {
  localMutationEpoch += 1;
  return localMutationEpoch;
}

/** @param {string | null} goalId */
function updateGoalRoute(goalId) {
  if (goalId) {
    const goal = state.data?.goals.find((candidate) => candidate.id === goalId && !candidate.archived);
    if (state.data && !goal) return false;
    setState({
      selectedGoalId: goalId,
      goalConfigDraft: goal ? goalConfigFromGoal(goal) : null,
      goalHistory: null,
      goalHistoryMonth: (state.selectedDate || state.data?.today || logicalDateFromDate()).slice(0, 7),
    });
  } else {
    goalHistoryRequestGate.cancel();
    setState({ goalIconPickerOpen: false, selectedGoalId: null, goalHistory: null, goalConfigDraft: null });
  }
  return true;
}

/** @param {Route} route @param {{ replace?: boolean }} [options] */
function writeRoute(route, { replace = false } = {}) {
  const depth = replace ? routeDepth : routeDepth + 1;
  const historyState = { ...(window.history.state ?? {}), [HISTORY_STATE_KEY]: true, daymarkView: route.view, daymarkGoalId: route.goalId ?? null, daymarkDepth: depth };
  if (replace) window.history.replaceState(historyState, "", routeUrl(route));
  else window.history.pushState(historyState, "", routeUrl(route));
  routeDepth = depth;
}

function restoreCurrentRoute() {
  const currentView = state.view;
  writeRoute({
    view: currentView,
    goalId: currentView === "goal" ? state.selectedGoalId ?? undefined : undefined,
    groupId: currentView === "add-activity" ? state.activityGroupId : undefined,
    returnView: currentView === "add-activity" ? state.activityReturnView : undefined,
  });
}

/** @param {Route} route @param {{ replace?: boolean }} [options] */
function applyRoute(route, { replace = false } = {}) {
  const routeNotice = pendingRouteNotice;
  pendingRouteNotice = null;
  if (route.view === "goal" && !route.goalId) route = { view: "log" };
  if (route.view === "goal" && !updateGoalRoute(route.goalId ?? null)) {
    route = { view: "log" };
    replace = true;
  }
  if (route.view === "add-activity") {
    const returnView = route.returnView === "settings" ? "settings" : "log";
    const groupId = state.data
      ? resolveActiveActivityGroupId({ groups: state.data.groups, requestedId: route.groupId }) || undefined
      : route.groupId;
    if (state.data && (groupId !== route.groupId || returnView !== route.returnView)) replace = true;
    route = { ...route, groupId, returnView };
    setState({ activityGroupId: groupId, activityReturnView: returnView });
  }
  if (route.view !== "goal") updateGoalRoute(null);
  setState({ view: route.view, message: routeNotice });
  if (replace) writeRoute(route, { replace: true });
}

/** @param {View} nextView @param {{ goalId?: string; groupId?: string; returnView?: ActivityCreationSource }} [options] */
function changeView(nextView, { goalId, groupId, returnView } = {}) {
  const { view, selectedGoalId } = state;
  if (state.isActivityCreateBusy && view === "add-activity" && nextView !== "add-activity") {
    setState({ message: { kind: "info", text: "Wait for the activity update to finish before leaving this view." } });
    return;
  }
  if (state.isSetupBusy && view === "settings" && nextView !== "settings") return;
  if (pendingGoalConfig && view === "goal" && nextView !== "goal") {
    setState({ message: { kind: "info", text: "Wait for the goal update to finish before leaving this goal." } });
    return;
  }
  const nextGoalId = nextView === "goal" ? goalId ?? selectedGoalId : undefined;
  if (nextView === "goal" && !nextGoalId) return;
  if (nextView === view && (nextView !== "goal" || nextGoalId === selectedGoalId)) return;
  const nextReturnView = nextView === "add-activity" ? returnView ?? (view === "settings" ? "settings" : "log") : undefined;
  const nextGroupId = nextView === "add-activity"
    ? groupId ?? (state.data ? resolveActiveActivityGroupId({ groups: state.data.groups }) || undefined : undefined)
    : undefined;
  if (nextView === "goal") updateGoalRoute(nextGoalId ?? null);
  else updateGoalRoute(null);
  if (nextView === "add-activity") setState({ activityGroupId: nextGroupId, activityReturnView: nextReturnView });
  writeRoute({ view: nextView, goalId: nextGoalId ?? undefined, groupId: nextGroupId, returnView: nextReturnView });
  setState({ view: nextView, message: null });
}

/** @param {string} goalId */
function openGoal(goalId) {
  if (pendingGoalConfig) return;
  if (!state.data?.goals.some((candidate) => candidate.id === goalId && !candidate.archived)) return;
  changeView("goal", { goalId });
}

/** @param {Notice} [notice] */
function closeGoal(notice) {
  if (pendingGoalConfig) {
    setState({ message: { kind: "info", text: "Wait for the goal update to finish before leaving this goal." } });
    return;
  }
  pendingRouteNotice = notice ?? null;
  if (navigationReady && routeDepth > 0) {
    window.history.back();
    return;
  }
  applyRoute({ view: "log" }, { replace: true });
}

/** @param {Notice} [notice] */
function closeAddActivity(notice) {
  if (state.isActivityCreateBusy && !notice) {
    setState({ message: { kind: "info", text: "Wait for the activity update to finish before leaving this view." } });
    return;
  }
  pendingRouteNotice = notice ?? null;
  if (navigationReady && routeDepth > 0) {
    window.history.back();
    return;
  }
  applyRoute({ view: state.activityReturnView }, { replace: true });
}

/** @param {PopStateEvent} event */
function handlePopState(event) {
  const nextRoute = routeFromLocation(window.location);
  const isLegacyEntriesRoute = new URLSearchParams(window.location.search).get("view") === "entries";
  const nextState = /** @type {{ daymarkRoute?: boolean; daymarkDepth?: number } | null} */ (event.state);
  routeDepth = nextState?.[HISTORY_STATE_KEY] && Number.isInteger(nextState.daymarkDepth) ? /** @type {number} */ (nextState.daymarkDepth) : 0;
  if (pendingGoalConfig && state.view === "goal" && (nextRoute.view !== "goal" || nextRoute.goalId !== state.selectedGoalId)) {
    setState({ message: { kind: "info", text: "Wait for the goal update to finish before leaving this goal." } });
    restoreCurrentRoute();
    return;
  }
  if (state.isSetupBusy && state.view === "settings" && nextRoute.view !== "settings") {
    setState({ message: { kind: "info", text: "Wait for the setup update to finish before leaving setup." } });
    restoreCurrentRoute();
    return;
  }
  if (state.isActivityCreateBusy && state.view === "add-activity" && nextRoute.view !== "add-activity" && !pendingRouteNotice) {
    setState({ message: { kind: "info", text: "Wait for the activity update to finish before leaving this view." } });
    restoreCurrentRoute();
    return;
  }
  applyRoute(nextRoute, { replace: isLegacyEntriesRoute });
}

/** @param {Catalog} catalog */
function dropDeletedFromDraft(catalog) {
  const nextDraft = withKnownCatalog({ record: state.draft, catalog });
  if (nextDraft !== state.draft) setState({ draft: nextDraft });
}

/** @param {Bootstrap} next */
function applyBootstrap(next) {
  const today = logicalDateFromDate();
  const storedDate = readActiveStoredDraft()?.logicalDate;
  // A draft kept for a day after today stays in storage, because that day cannot be opened yet.
  const nextDate = state.selectedDate || (storedDate && storedDate <= today ? storedDate : today);
  setState({
    data: { ...next, entries: (state.data?.entries ?? []).map((entry) => withKnownCatalog({ record: entry, catalog: next })), today, yesterday: addDays(today, -1) },
    calendarMonth: state.calendarMonth || nextDate.slice(0, 7),
  });
  dropDeletedFromDraft(next);
  if (state.view === "goal" && state.selectedGoalId) {
    const goal = next.goals.find((candidate) => candidate.id === state.selectedGoalId && !candidate.archived);
    if (goal) {
      if (!state.goalConfigDraft) setState({ goalConfigDraft: goalConfigFromGoal(goal) });
    } else {
      updateGoalRoute(null);
      setState({ view: "log" });
      writeRoute({ view: "log" }, { replace: true });
    }
  }
  // Load the day once. A later catalog refresh leaves the selected day alone,
  // and its own refresh keeps it current.
  if (!state.selectedDate) void chooseDate(nextDate);
}

async function loadBootstrap() {
  const request = bootstrapRequestGate.begin();
  setState({ connectionState: "checking" });
  try {
    const response = await fetch("/api/bootstrap", {
      cache: "no-store",
      signal: request.signal,
    });
    if (!response.ok) throw new Error("Could not connect to your journal.");
    const next = /** @type {Bootstrap} */ (await response.json());
    if (request.isCurrent()) {
      applyBootstrap(next);
      setState({ connectionState: "online" });
    }
    return next;
  } catch (error) {
    if (request.isCurrent() && !request.signal.aborted) setState({ connectionState: navigator.onLine ? "error" : "offline" });
    throw error;
  }
}

function updateLocalDay() {
  const today = logicalDateFromDate();
  if (state.data && state.data.today !== today) updateData((current) => ({ ...current, today, yesterday: addDays(today, -1) }));
}

function refreshOnReturn() {
  updateLocalDay();
  if (document.visibilityState === "visible") void refreshSelectedDay();
}

/** Loads the entry days of the calendar month. It runs when the calendar opens and when its month changes. */
function loadCalendar() {
  const { calendarMonth, view } = state;
  if (view !== "calendar" || !/^\d{4}-\d{2}$/.test(calendarMonth)) return undefined;
  let cancelled = false;
  state.isLoadingCalendar = true;
  state.calendarDays = [];
  fetch(`/api/calendar?month=${calendarMonth}`, { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) throw new Error("Could not load that month.");
      return /** @type {{ days: CalendarEntryDay[] }} */ (await response.json());
    })
    .then((result) => {
      if (!cancelled) setState({ calendarDays: result.days, connectionState: "online", message: null });
    })
    .catch((/** @type {Error} */ error) => {
      if (!cancelled) setState({ connectionState: navigator.onLine ? "error" : "offline", message: { kind: "error", text: error.message } });
    })
    .finally(() => {
      if (!cancelled) setState({ isLoadingCalendar: false });
    });
  return () => {
    cancelled = true;
  };
}

// Week statuses are judged against today, so the history loads again when the local day changes while the goal stays open.
function loadGoalHistory() {
  const { goalHistoryMonth, selectedGoalId, view } = state;
  if (view !== "goal" || !selectedGoalId || !/^\d{4}-\d{2}$/.test(goalHistoryMonth)) return undefined;
  const request = goalHistoryRequestGate.begin();
  state.isLoadingGoalHistory = true;
  const search = new URLSearchParams({ month: goalHistoryMonth, asOf: logicalDateFromDate() });
  fetch(`/api/goals/${selectedGoalId}/history?${search}`, { cache: "no-store", signal: request.signal })
    .then(async (response) => {
      const result = /** @type {GoalHistory & { error?: string }} */ (await response.json());
      if (!response.ok) throw new Error(result.error ?? "Could not load goal history.");
      return result;
    })
    .then((result) => {
      if (request.isCurrent()) setState({ goalHistory: result, connectionState: "online" });
    })
    .catch((/** @type {Error} */ error) => {
      if (request.signal.aborted || !request.isCurrent()) return;
      setState({ connectionState: navigator.onLine ? "error" : "offline", message: { kind: "error", text: error.message } });
    })
    .finally(() => {
      if (request.isCurrent()) setState({ isLoadingGoalHistory: false });
    });
  return () => {
    if (!request.signal.aborted) goalHistoryRequestGate.cancel();
  };
}

/** @param {string} nextDate */
async function chooseDate(nextDate) {
  if (!isLogicalDate(nextDate)) return;
  // A day that has not started has nothing to record.
  if (nextDate > logicalDateFromDate()) return;
  if (entryMutation) {
    setState({ message: { kind: "info", text: "Wait for the entry update to finish before changing the day." } });
    return;
  }
  if (state.selectedDate && hasPendingGoalToggle(state.selectedDate)) {
    setState({ message: { kind: "info", text: "Wait for the goal update to finish before changing the day." } });
    return;
  }
  if (state.selectedDate && hasPendingSelectionToggle(state.selectedDate)) {
    setState({ message: { kind: "info", text: "Wait for the mood or activity update to finish before changing the day." } });
    return;
  }
  dayRefreshRequestGate.cancel();
  const request = dateRequestGate.begin();
  markLocalDraft(false);
  rememberDraftDate(nextDate);
  selectedDateEpoch += 1;
  setState({ loadedDate: "", draft: EMPTY_DRAFT, selectedDate: nextDate, calendarMonth: nextDate.slice(0, 7), message: null, isLoadingDate: true });
  try {
    const { entry: serverEntry, completedGoalIds: serverCompletedGoalIds, daySelections: serverSelections } =
      await fetchDayState({ logicalDate: nextDate, signal: request.signal, errorText: "Could not load that date." });
    if (!request.isCurrent()) return;
    const recovered = draftForDate({
      logicalDate: nextDate,
      serverEntry,
      serverCompletedGoalIds,
      serverSelections,
    });
    // A draft kept on this device can name an activity that was deleted after the draft was written.
    if (state.data) recovered.draft = withKnownCatalog({ record: recovered.draft, catalog: state.data });
    let resolvedEntry = serverEntry;
    let resolvedDraft = recovered.draft;
    /** @type {string | null} */
    let recoveryError = null;
    if (serverEntry && recovered.restored) {
      try {
        if (!sameEntrySelections(recovered.draft, serverEntry)) {
          const saveResponse = await fetch(`/api/entries/${nextDate}`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(entryInputFromDraft(recovered.draft)),
            signal: request.signal,
          });
          const saveResult = /** @type {{ entry?: Entry; error?: string }} */ (await saveResponse.json());
          if (!saveResponse.ok || !saveResult.entry) throw new Error(saveResult.error ?? "The server rejected the entry.");
          resolvedEntry = saveResult.entry;
        }
        if (!request.isCurrent()) return;
        clearStoredDraft(nextDate);
        resolvedDraft = draftFromEntry(resolvedEntry);
      } catch (error) {
        if (request.signal.aborted || !request.isCurrent()) return;
        resolvedDraft = draftFromEntry(serverEntry);
        recoveryError = `Could not restore your last choice. ${/** @type {Error} */ (error).message}`;
      }
    }
    if (!request.isCurrent()) return;
    markLocalDraft(recovered.restored && !serverEntry);
    setState({
      draft: resolvedDraft,
      loadedDate: nextDate,
      connectionState: recoveryError ? navigator.onLine ? "error" : "offline" : "online",
    });
    updateData((current) => ({
      ...current,
      entries: [
        ...(resolvedEntry ? [resolvedEntry] : []),
        ...current.entries.filter((entry) => entry.logicalDate !== nextDate),
      ],
    }));
    if (recoveryError) setState({ message: { kind: "error", text: recoveryError } });
  } catch (error) {
    if (request.signal.aborted || !request.isCurrent()) return;
    setState({ connectionState: navigator.onLine ? "error" : "offline", message: { kind: "error", text: /** @type {Error} */ (error).message } });
  } finally {
    if (request.isCurrent()) setState({ isLoadingDate: false });
  }
}

async function refreshSelectedDay() {
  if (state.view !== "log" || document.visibilityState !== "visible" || !navigator.onLine) return;
  const logicalDate = state.selectedDate;
  const dateEpoch = selectedDateEpoch;
  const mutationEpoch = localMutationEpoch;
  if (
    !logicalDate ||
    state.loadedDate !== logicalDate ||
    hasLocalDraft ||
    entryMutation ||
    hasPendingGoalToggle(logicalDate) ||
    hasPendingSelectionToggle(logicalDate)
  ) return;

  const request = dayRefreshRequestGate.begin();
  const isRelevant = () =>
    request.isCurrent() &&
    document.visibilityState === "visible" &&
    state.view === "log" &&
    state.selectedDate === logicalDate &&
    selectedDateEpoch === dateEpoch &&
    state.loadedDate === logicalDate &&
    localMutationEpoch === mutationEpoch &&
    !hasLocalDraft &&
    !entryMutation &&
    !hasPendingGoalToggle(logicalDate) &&
    !hasPendingSelectionToggle(logicalDate);
  try {
    const { entry: serverEntry, completedGoalIds: serverCompletedGoalIds, daySelections: serverSelections } =
      await fetchDayState({ logicalDate, signal: request.signal, errorText: "Could not refresh that date." });
    if (!isRelevant()) return;

    const nextDraft = draftFromDayRefreshState({
      entry: serverEntry,
      completedGoalIds: serverCompletedGoalIds,
      daySelections: serverSelections,
    });
    if (!sameDraft(state.draft, nextDraft)) setState({ draft: nextDraft });
    const currentEntry = getEntryForDate(state.data?.entries ?? [], logicalDate);
    if (!sameEntry(currentEntry, serverEntry)) {
      updateData((current) => ({
        ...current,
        entries: serverEntry
          ? [serverEntry, ...current.entries.filter((entry) => entry.logicalDate !== logicalDate)]
          : current.entries.filter((entry) => entry.logicalDate !== logicalDate),
      }));
    }
    setState({ connectionState: "online" });
  } catch {
    if (request.signal.aborted || !isRelevant()) return;
    setState({ connectionState: navigator.onLine ? "error" : "offline" });
  }
}

/** @param {Partial<Draft>} patch @param {{ markLocal?: boolean }} [options] */
function updateDraft(patch, { markLocal = true } = {}) {
  const next = { ...state.draft, ...patch };
  setState({ draft: next, message: null });
  if (state.selectedDate) writeStoredDraft(state.selectedDate, next);
  if (markLocal) markLocalDraft(true);
}

/** @param {string} logicalDate @param {"mood" | "activity"} kind @param {string} [id] */
function selectionPendingKey(logicalDate, kind, id) {
  return `${logicalDate}:${kind}:${id ?? ""}`;
}

/** @param {Set<string>} keys @param {string} key @param {boolean} pending */
function setPending(keys, key, pending) {
  if (pending) keys.add(key);
  else keys.delete(key);
  invalidate();
}

/** @param {string} logicalDate */
function hasPendingSelectionToggle(logicalDate) {
  const prefix = `${logicalDate}:`;
  return [...state.pendingSelectionKeys].some((key) => key.startsWith(prefix));
}

/** @param {string} logicalDate @param {string} key */
function hasOtherPendingSelectionFor(logicalDate, key) {
  return [...state.pendingSelectionKeys].some((pendingKey) => pendingKey !== key && pendingKey.startsWith(`${logicalDate}:`));
}

// A saved toggle clears the stored draft once no other toggle is pending,
// and clears the error state once no toggle for the day has failed.
/** @param {string} logicalDate @param {string} key */
function settleSavedSelection(logicalDate, key) {
  const hasOtherPendingSelection = hasOtherPendingSelectionFor(logicalDate, key);
  if (!hasOtherPendingSelection && !hasLocalDraft) {
    clearStoredDraft(logicalDate);
    markLocalDraft(false);
  }
  const hasFailedSelection = [...failedSelections].some((failedKey) => failedKey.startsWith(`${logicalDate}:`));
  if (!hasFailedSelection) setState({ connectionState: "online", message: null });
}

// A failed toggle has already been rolled back in the draft. Keep the stored draft
// only if there was one before, or another toggle is still pending.
/** @param {{ logicalDate: string; key: string; hadLocalDraft: boolean; text: string }} input */
function settleFailedSelection({ logicalDate, key, hadLocalDraft, text }) {
  if (hadLocalDraft || hasOtherPendingSelectionFor(logicalDate, key)) writeStoredDraft(logicalDate, state.draft);
  else clearStoredDraft(logicalDate);
  markLocalDraft(hadLocalDraft);
  setState({ connectionState: navigator.onLine ? "error" : "offline", message: { kind: "error", text } });
}

/** @param {string} id */
async function toggleMood(id) {
  const logicalDate = state.selectedDate;
  const key = selectionPendingKey(logicalDate, "mood");
  if (!logicalDate || state.loadedDate !== logicalDate || entryMutation || state.isLoadingDate || state.pendingSelectionKeys.has(key)) return;
  const previousMoodId = state.draft.moodId;
  if (previousMoodId === id) return;
  const hadLocalDraft = hasLocalDraft;
  const nextDraft = { ...state.draft, moodId: id };
  const dateEpoch = selectedDateEpoch;
  beginLocalMutation();
  setPending(state.pendingSelectionKeys, key, true);
  updateDraft({ moodId: id }, { markLocal: false });
  try {
    const response = await fetch(`/api/day-selections/${logicalDate}/mood`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ moodId: id }),
    });
    const result = /** @type {{ selection?: { moodId: string }; error?: string }} */ (await response.json());
    if (!response.ok || !result.selection || result.selection.moodId !== id) throw new Error(result.error ?? "The mood update was out of date.");
    failedSelections.delete(key);
    if (state.selectedDate === logicalDate && selectedDateEpoch === dateEpoch) {
      updateData((current) => ({
        ...current,
        entries: current.entries.map((entry) => entry.logicalDate === logicalDate ? { ...entry, moodId: id } : entry),
      }));
      settleSavedSelection(logicalDate, key);
    }
  } catch (error) {
    failedSelections.add(key);
    if (state.selectedDate === logicalDate && selectedDateEpoch === dateEpoch) {
      updateDraft({ moodId: previousMoodId }, { markLocal: false });
      settleFailedSelection({ logicalDate, key, hadLocalDraft, text: `${/** @type {Error} */ (error).message} The mood was restored.` });
    } else writeStoredDraft(logicalDate, nextDraft);
  } finally {
    setPending(state.pendingSelectionKeys, key, false);
  }
}

/** @param {string} logicalDate @param {string} goalId */
function goalPendingKey(logicalDate, goalId) {
  return `${logicalDate}:${goalId}`;
}

/** @param {string} logicalDate */
function hasPendingGoalToggle(logicalDate) {
  const prefix = `${logicalDate}:`;
  return [...state.pendingGoalKeys].some((key) => key.startsWith(prefix));
}

/** @param {string} id */
async function toggleActivity(id) {
  const logicalDate = state.selectedDate;
  const key = selectionPendingKey(logicalDate, "activity", id);
  if (!logicalDate || state.loadedDate !== logicalDate || entryMutation || state.isLoadingDate || state.pendingSelectionKeys.has(key)) return;
  const linkedGoalIds = state.data?.goals
    .filter((goal) => !goal.archived && goal.activityId === id)
    .map((goal) => goal.id) ?? [];
  const linkedGoalKeys = linkedGoalIds.map((goalId) => goalPendingKey(logicalDate, goalId));
  const previousSelected = state.draft.activityIds.includes(id);
  const hadLocalDraft = hasLocalDraft;
  const nextSelected = !previousSelected;
  const nextActivityIds = nextSelected
    ? [...new Set([...state.draft.activityIds, id])]
    : state.draft.activityIds.filter((item) => item !== id);
  const previousGoalStates = new Map(linkedGoalIds.map((goalId) => [goalId, state.draft.completedGoalIds.includes(goalId)]));
  const nextCompletedGoalIds = applyToggles(state.draft.completedGoalIds, completionToggles(linkedGoalIds.map((goalId) => ({ goalId, completed: nextSelected }))));
  const nextDraft = {
    ...state.draft,
    activityIds: nextActivityIds,
    completedGoalIds: nextCompletedGoalIds,
  };
  const dateEpoch = selectedDateEpoch;
  beginLocalMutation();
  setPending(state.pendingSelectionKeys, key, true);
  for (const goalKey of linkedGoalKeys) setPending(state.pendingGoalKeys, goalKey, true);
  updateDraft({ activityIds: nextActivityIds, completedGoalIds: nextCompletedGoalIds }, { markLocal: false });
  try {
    const response = await fetch(`/api/day-selections/${logicalDate}/activities/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ selected: nextSelected }),
    });
    const result = /** @type {{ selection?: { activityId: string; selected: boolean }; affectedGoalCompletions?: Array<{ goalId: string; completed: boolean }>; affectedActivitySelections?: Array<{ activityId: string; selected: boolean }>; error?: string }} */ (await response.json());
    if (!response.ok || !result.selection || result.selection.activityId !== id || result.selection.selected !== nextSelected) throw new Error(result.error ?? "The activity update was out of date.");
    const affectedGoalCompletions = result.affectedGoalCompletions ?? [];
    const affectedActivitySelections = result.affectedActivitySelections ?? [result.selection];
    if (
      affectedGoalCompletions.length !== linkedGoalIds.length ||
      linkedGoalIds.some((goalId) => !affectedGoalCompletions.some((completion) => completion.goalId === goalId && completion.completed === nextSelected))
    ) throw new Error("The activity update was out of date.");
    failedSelections.delete(key);
    if (state.selectedDate === logicalDate && selectedDateEpoch === dateEpoch) {
      updateDraft(
        {
          activityIds: applyToggles(state.draft.activityIds, selectionToggles(affectedActivitySelections)),
          completedGoalIds: applyToggles(state.draft.completedGoalIds, completionToggles(affectedGoalCompletions)),
        },
        { markLocal: false },
      );
      updateData((current) => ({
        ...current,
        entries: current.entries.map((entry) =>
          entry.logicalDate === logicalDate
            ? {
                ...entry,
                activityIds: applyToggles(entry.activityIds, selectionToggles(affectedActivitySelections)),
                completedGoalIds: applyToggles(entry.completedGoalIds, completionToggles(affectedGoalCompletions)),
              }
            : entry,
        ),
      }));
      settleSavedSelection(logicalDate, key);
    }
  } catch (error) {
    failedSelections.add(key);
    if (state.selectedDate === logicalDate && selectedDateEpoch === dateEpoch) {
      updateDraft(
        {
          activityIds: previousSelected
            ? [...new Set([...state.draft.activityIds, id])]
            : state.draft.activityIds.filter((item) => item !== id),
          completedGoalIds: applyToggles(state.draft.completedGoalIds, previousGoalStates),
        },
        { markLocal: false },
      );
      settleFailedSelection({ logicalDate, key, hadLocalDraft, text: `${/** @type {Error} */ (error).message} The activity was restored.` });
    } else writeStoredDraft(logicalDate, nextDraft);
  } finally {
    setPending(state.pendingSelectionKeys, key, false);
    for (const goalKey of linkedGoalKeys) setPending(state.pendingGoalKeys, goalKey, false);
  }
}

/** @param {string} id */
async function toggleGoal(id) {
  const logicalDate = state.selectedDate;
  const key = goalPendingKey(logicalDate, id);
  if (!logicalDate || state.loadedDate !== logicalDate || entryMutation || state.isLoadingDate || state.pendingGoalKeys.has(key)) return;
  if (!navigator.onLine) {
    setState({ message: { kind: "error", text: "You’re offline. Reconnect before updating a goal." }, connectionState: "offline" });
    return;
  }
  const linkedActivityId = state.data?.goals.find((goal) => goal.id === id)?.activityId ?? null;
  const affectedGoalIds = linkedActivityId
    ? state.data?.goals.filter((goal) => !goal.archived && goal.activityId === linkedActivityId).map((goal) => goal.id) ?? [id]
    : [id];
  const affectedGoalKeys = affectedGoalIds.map((goalId) => goalPendingKey(logicalDate, goalId));
  const activityKey = linkedActivityId ? selectionPendingKey(logicalDate, "activity", linkedActivityId) : null;
  const previousChecked = state.draft.completedGoalIds.includes(id);
  const nextChecked = !previousChecked;
  const previousGoalStates = new Map(affectedGoalIds.map((goalId) => [goalId, state.draft.completedGoalIds.includes(goalId)]));
  const previousActivitySelected = linkedActivityId ? state.draft.activityIds.includes(linkedActivityId) : undefined;
  const nextCompletedGoalIds = applyToggles(state.draft.completedGoalIds, completionToggles(affectedGoalIds.map((goalId) => ({ goalId, completed: nextChecked }))));
  const nextActivityIds = linkedActivityId
    ? applyToggles(state.draft.activityIds, selectionToggles([{ activityId: linkedActivityId, selected: nextChecked }]))
    : state.draft.activityIds;
  const dateEpoch = selectedDateEpoch;
  beginLocalMutation();
  for (const goalKey of affectedGoalKeys) setPending(state.pendingGoalKeys, goalKey, true);
  if (activityKey) setPending(state.pendingSelectionKeys, activityKey, true);
  setState({ draft: { ...state.draft, completedGoalIds: nextCompletedGoalIds, activityIds: nextActivityIds } });
  try {
    const response = await fetch(`/api/goal-completions/${logicalDate}/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ completed: nextChecked }),
    });
    const result = /** @type {{ completion?: { goalId: string; completed: boolean }; selection?: { activityId: string; selected: boolean }; affectedGoalCompletions?: Array<{ goalId: string; completed: boolean }>; affectedActivitySelections?: Array<{ activityId: string; selected: boolean }>; error?: string }} */ (await response.json());
    if (!response.ok || !result.completion || result.completion.goalId !== id || result.completion.completed !== nextChecked) throw new Error(result.error ?? "The goal update was out of date.");
    const affectedGoalCompletions = result.affectedGoalCompletions ?? [result.completion];
    const affectedActivitySelections = result.affectedActivitySelections ?? (result.selection ? [result.selection] : []);
    if (
      affectedGoalCompletions.length !== affectedGoalIds.length ||
      affectedGoalIds.some((goalId) => !affectedGoalCompletions.some((completion) => completion.goalId === goalId && completion.completed === nextChecked)) ||
      (linkedActivityId && !affectedActivitySelections.some((selection) => selection.activityId === linkedActivityId && selection.selected === nextChecked))
    ) throw new Error("The goal update was out of date.");
    if (state.selectedDate === logicalDate && selectedDateEpoch === dateEpoch && result.completion.completed === nextChecked) {
      setState({
        draft: {
          ...state.draft,
          completedGoalIds: applyToggles(state.draft.completedGoalIds, completionToggles(affectedGoalCompletions)),
          activityIds: applyToggles(state.draft.activityIds, selectionToggles(affectedActivitySelections)),
        },
        connectionState: "online",
        message: null,
      });
      updateData((current) => ({
        ...current,
        entries: current.entries.map((entry) =>
          entry.logicalDate === logicalDate
            ? {
                ...entry,
                completedGoalIds: applyToggles(entry.completedGoalIds, completionToggles(affectedGoalCompletions)),
                activityIds: applyToggles(entry.activityIds, selectionToggles(affectedActivitySelections)),
              }
            : entry,
        ),
      }));
    }
  } catch (error) {
    if (state.selectedDate === logicalDate && selectedDateEpoch === dateEpoch) {
      setState({
        draft: {
          ...state.draft,
          completedGoalIds: applyToggles(state.draft.completedGoalIds, previousGoalStates),
          activityIds: linkedActivityId && previousActivitySelected !== undefined
            ? applyToggles(state.draft.activityIds, selectionToggles([{ activityId: linkedActivityId, selected: previousActivitySelected }]))
            : state.draft.activityIds,
        },
        message: { kind: "error", text: `${/** @type {Error} */ (error).message} The goal was restored.` },
        connectionState: navigator.onLine ? "error" : "offline",
      });
    }
  } finally {
    for (const goalKey of affectedGoalKeys) setPending(state.pendingGoalKeys, goalKey, false);
    if (activityKey) setPending(state.pendingSelectionKeys, activityKey, false);
  }
}

async function saveGoalConfig() {
  const goalId = state.selectedGoalId;
  const config = state.goalConfigDraft;
  const currentGoal = state.data?.goals.find((goal) => goal.id === goalId);
  if (!goalId || !config || !currentGoal || state.isSavingGoalConfig || pendingGoalConfig) return;
  const name = config.name.trim();
  if (!name) {
    setState({ message: { kind: "error", text: "Goal name is required." } });
    return;
  }
  if (config.repeatType === "daily" && (config.weekdaysMask < 1 || config.weekdaysMask > ALL_WEEKDAYS_MASK)) {
    setState({ message: { kind: "error", text: "Choose at least one weekday for a daily goal." } });
    return;
  }
  if (config.repeatType === "weekly" && (config.targetPerWeek < 1 || config.targetPerWeek > 7)) {
    setState({ message: { kind: "error", text: "Choose between 1 and 7 days per week." } });
    return;
  }
  if (!navigator.onLine) {
    setState({ message: { kind: "error", text: "You’re offline. Reconnect before updating a goal." }, connectionState: "offline" });
    return;
  }
  /** @type {Goal["scheduleType"]} */
  const scheduleType = config.repeatType === "weekly" ? "times_per_week" : config.weekdaysMask === ALL_WEEKDAYS_MASK ? "daily" : "weekdays";
  const patch = {
    name,
    activityId: config.activityId,
    materialIcon: config.materialIcon,
    repeatType: config.repeatType,
    scheduleType,
    targetPerWeek: config.repeatType === "weekly" ? config.targetPerWeek : null,
    weekdaysMask: config.repeatType === "daily" ? config.weekdaysMask : null,
  };
  const previousGoal = currentGoal;
  const optimisticGoal = { ...currentGoal, ...patch };
  const sequence = goalConfigSaveSequence + 1;
  goalConfigSaveSequence = sequence;
  activeGoalConfigSave = { sequence, goalId };
  const isCurrentSave = () => activeGoalConfigSave?.sequence === sequence;
  const isCurrentGoal = () => isCurrentSave() && state.selectedGoalId === goalId;
  /** @param {Goal} replacement */
  const replaceGoal = (replacement) => updateData((current) => ({ ...current, goals: current.goals.map((goal) => goal.id === goalId ? replacement : goal) }));
  pendingGoalConfig = true;
  setState({ isSavingGoalConfig: true, message: null });
  replaceGoal(optimisticGoal);
  try {
    const response = await fetch(`/api/catalog/goal/${goalId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    const result = /** @type {{ goal?: Goal; error?: string }} */ (await response.json());
    if (!response.ok || !result.goal) throw new Error(result.error ?? "Could not update the goal.");
    if (isCurrentSave()) {
      replaceGoal(result.goal);
      if (isCurrentGoal()) {
        setState({
          goalConfigDraft: goalConfigFromGoal(result.goal),
          goalHistory: null,
          goalHistoryRevision: state.goalHistoryRevision + 1,
          connectionState: "online",
          message: { kind: "success", text: "Goal updated." },
        });
      }
    }
  } catch (error) {
    if (isCurrentSave()) {
      replaceGoal(previousGoal);
      if (isCurrentGoal()) {
        setState({
          goalConfigDraft: config,
          connectionState: navigator.onLine ? "error" : "offline",
          message: { kind: "error", text: `${/** @type {Error} */ (error).message} The goal was restored.` },
        });
      }
    }
  } finally {
    if (isCurrentSave()) {
      activeGoalConfigSave = null;
      pendingGoalConfig = false;
      setState({ isSavingGoalConfig: false });
    }
  }
}

// Archive and delete both take the open goal out of the active goals, so its view closes afterward.
/** @param {"archive" | "delete"} action */
async function retireGoal(action) {
  const goalId = state.selectedGoalId;
  const goal = state.data?.goals.find((candidate) => candidate.id === goalId);
  if (!goalId || !goal || state.isSavingGoalConfig || pendingGoalConfig) return;
  if (action === "delete" && !window.confirm(deleteWarning({ kind: "goal", name: goal.name }))) return;
  if (!navigator.onLine) {
    setState({ message: { kind: "error", text: "You’re offline. Reconnect before updating a goal." }, connectionState: "offline" });
    return;
  }
  pendingGoalConfig = true;
  setState({ isSavingGoalConfig: true, goalAction: action, message: null });
  try {
    const response = await fetch(`/api/catalog/goal/${goalId}`, action === "delete"
      ? { method: "DELETE" }
      : { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ archived: true }) });
    const result = /** @type {{ error?: string }} */ (await response.json());
    if (!response.ok) throw new Error(result.error ?? `Could not ${action} the goal.`);
    if (action === "delete") {
      const catalog = { activities: state.data?.activities ?? [], goals: (state.data?.goals ?? []).filter((candidate) => candidate.id !== goalId) };
      updateData((current) => ({ ...current, goals: catalog.goals, entries: current.entries.map((entry) => withKnownCatalog({ record: entry, catalog })) }));
      dropDeletedFromDraft(catalog);
      // The goal is gone, so nothing of its view stays on screen while the route changes.
      updateGoalRoute(null);
    } else {
      updateData((current) => ({ ...current, goals: current.goals.map((candidate) => candidate.id === goalId ? { ...candidate, archived: true } : candidate) }));
    }
    setState({ connectionState: "online" });
    pendingGoalConfig = false;
    closeGoal({ kind: "success", text: action === "delete" ? `Deleted “${goal.name}”.` : `Archived “${goal.name}”. You can restore it in Setup.` });
  } catch (error) {
    setState({ connectionState: navigator.onLine ? "error" : "offline", message: { kind: "error", text: /** @type {Error} */ (error).message } });
  } finally {
    pendingGoalConfig = false;
    setState({ isSavingGoalConfig: false, goalAction: null });
  }
}

async function saveEntry() {
  const { selectedDate, draft } = state;
  if (state.isSaving || state.isDeleting || entryMutation || state.loadedDate !== selectedDate || !selectedDate) return;
  if (hasPendingGoalToggle(selectedDate) || hasPendingSelectionToggle(selectedDate)) {
    setState({ message: { kind: "info", text: "Wait for the mood, activity, or goal update to finish before saving the entry." } });
    return;
  }
  if (!draft.moodId) {
    setState({ message: { kind: "error", text: "Pick the mood that best sums up the day." } });
    return;
  }
  if (!navigator.onLine) {
    setState({ message: { kind: "error", text: "You’re offline. Reconnect to save this entry." }, connectionState: "offline" });
    return;
  }
  entryMutation = true;
  beginLocalMutation();
  setState({ isSaving: true, connectionState: "checking", message: null });
  try {
    const response = await fetch(`/api/entries/${selectedDate}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(entryInputFromDraft(draft)),
    });
    const result = /** @type {{ entry?: Entry; error?: string }} */ (await response.json());
    const savedEntry = result.entry;
    if (!response.ok || !savedEntry) throw new Error(result.error ?? "Could not save the entry.");
    updateData((current) => ({
      ...current,
      entries: [savedEntry, ...current.entries.filter((entry) => entry.logicalDate !== selectedDate)],
    }));
    clearStoredDraft(selectedDate);
    markLocalDraft(false);
    setState({ draft: draftFromEntry(savedEntry), connectionState: "online", message: { kind: "success", text: `Saved ${shortDate(selectedDate)}.` } });
  } catch (error) {
    setState({ connectionState: navigator.onLine ? "error" : "offline", message: { kind: "error", text: `${/** @type {Error} */ (error).message} Try again.` } });
  } finally {
    entryMutation = false;
    setState({ isSaving: false });
  }
}

async function deleteSelectedEntry() {
  const { selectedDate, draft } = state;
  if (state.isDeleting || state.isSaving || !draft.version || entryMutation || state.loadedDate !== selectedDate) return;
  if (hasPendingGoalToggle(selectedDate) || hasPendingSelectionToggle(selectedDate)) {
    setState({ message: { kind: "info", text: "Wait for the mood, activity, or goal update to finish before deleting the entry." } });
    return;
  }
  if (!window.confirm(`Delete the entry for ${friendlyDate(selectedDate)}?`)) return;
  if (!navigator.onLine) {
    setState({ message: { kind: "error", text: "You’re offline. Reconnect before deleting an entry." }, connectionState: "offline" });
    return;
  }
  entryMutation = true;
  beginLocalMutation();
  setState({ isDeleting: true, connectionState: "checking", message: null });
  try {
    const response = await fetch(`/api/entries/${selectedDate}?expectedVersion=${draft.version}`, { method: "DELETE" });
    if (!response.ok) throw new Error("Could not delete that entry.");
    updateData((current) => ({ ...current, entries: current.entries.filter((entry) => entry.logicalDate !== selectedDate) }));
    clearStoredDraft(selectedDate);
    markLocalDraft(false);
    setState({
      draft: { ...EMPTY_DRAFT, completedGoalIds: [...state.draft.completedGoalIds] },
      connectionState: "online",
      message: { kind: "success", text: "Entry deleted." },
    });
  } catch (error) {
    setState({ connectionState: navigator.onLine ? "error" : "offline", message: { kind: "error", text: /** @type {Error} */ (error).message } });
  } finally {
    entryMutation = false;
    setState({ isDeleting: false });
  }
}

const theme = startTheme({ onChange: (themePreference) => setState({ themePreference }) });

/** What each view can read and do. */
const app = {
  state,
  set: setState,
  invalidate,
  changeView,
  chooseDate,
  closeAddActivity,
  closeGoal,
  deleteSelectedEntry,
  loadBootstrap,
  openGoal,
  retireGoal,
  saveEntry,
  saveGoalConfig,
  toggleActivity,
  toggleGoal,
  toggleMood,
  updateThemePreference: theme.updatePreference,
};

/** @type {Record<View, (app: App) => ViewInstance>} */
const VIEWS = {
  log: createLogView,
  calendar: createCalendarView,
  insights: createInsightsView,
  goal: createGoalView,
  "add-activity": createAddActivityView,
  settings: createSetupView,
};

const VIEW_TITLES = /** @type {Record<View, string>} */ ({
  log: "Your journal",
  calendar: "Your calendar",
  insights: "Your insights",
  goal: "Goal history",
  "add-activity": "Add activity",
  settings: "Your setup",
});

// The shell is in the page already. These are its parts.
/** @param {string} selector @returns {any} */
const find = (selector) => document.querySelector(selector);
const shell = find(".app-shell");
const topbar = find(".topbar");
const brand = find(".brand");
const topbarDate = find(".topbar-date");
const connectionPill = find(".connection-pill");
const main = find("main");
const nav = find(".bottom-nav");
/** @type {HTMLButtonElement[]} */
const navButtons = [...nav.querySelectorAll("button[data-view]")];
const loadingShell = find(".journal-loading");
const loadingStatus = loadingShell.firstElementChild;
const loadingEyebrow = loadingShell.querySelector(".eyebrow");
const loadingTitle = loadingShell.querySelector("h1");
const loadingError = create(html`<div class="notice error" role="alert"><p></p><button type="button" class="loading-retry">Retry</button></div>`);
const shellNotice = create(html`<div role="status"></div>`);
const dateSwitcher = create(html`<div class="topbar-date-switcher" aria-label="Choose the journal day" aria-live="polite"><button aria-label="Previous day">${icon("chevron_left")}</button><span class="topbar-date-label"></span><button aria-label="Next day">${icon("chevron_right")}</button></div>`);
const [previousDayButton, dateLabel, nextDayButton] = /** @type {HTMLElement[]} */ ([...dateSwitcher.children]);
const topbarActions = create(html`<div class="topbar-actions"><button>Today</button><button class="topbar-calendar" type="button" aria-label="Choose a date">${icon("calendar_month")}</button><input class="topbar-calendar-input" type="date" tabindex="-1" aria-label="Journal date"></div>`);
const [todayButton, datePickerButton, dateInput] = /** @type {[HTMLButtonElement, HTMLButtonElement, HTMLInputElement]} */ ([...topbarActions.children]);

// The journal stops at today. This is true while today, or a later day left over from a clock change, is open.
const isLatestDay = () => Boolean(state.data && state.selectedDate >= state.data.today);

/** @type {{ x: number; y: number } | null} */
let dateSwipeStart = null;

dateSwitcher.addEventListener("touchstart", (event) => {
  const touch = event.touches.length === 1 ? event.touches[0] : null;
  dateSwipeStart = touch ? { x: touch.clientX, y: touch.clientY } : null;
}, { passive: true });

// The label follows the finger a short way so the swipe has visible feedback.
dateSwitcher.addEventListener("touchmove", (event) => {
  const touch = event.touches[0];
  if (!dateSwipeStart || !touch) return;
  // The label does not move toward a day that cannot be opened.
  const pull = Math.max(isLatestDay() ? 0 : -28, Math.min(28, (touch.clientX - dateSwipeStart.x) / 3));
  dateLabel.style.transform = `translateX(${pull}px)`;
}, { passive: true });

/** @param {TouchEvent | null} event */
function endDateSwipe(event) {
  const start = dateSwipeStart;
  dateSwipeStart = null;
  dateLabel.style.transform = "";
  const touch = event?.changedTouches[0];
  if (!start || !touch || state.isLoadingDate || !state.selectedDate) return;
  const offset = dayOffsetFromSwipe({ deltaX: touch.clientX - start.x, deltaY: touch.clientY - start.y });
  if (offset !== 0) void chooseDate(addDays(state.selectedDate, offset));
}
dateSwitcher.addEventListener("touchend", endDateSwipe);
dateSwitcher.addEventListener("touchcancel", () => endDateSwipe(null));

previousDayButton.addEventListener("click", () => void chooseDate(addDays(state.selectedDate, -1)));
nextDayButton.addEventListener("click", () => void chooseDate(addDays(state.selectedDate, 1)));
todayButton.addEventListener("click", () => void chooseDate(state.data?.today ?? ""));
datePickerButton.addEventListener("click", () => {
  if (state.isLoadingDate) return;
  try {
    dateInput.showPicker();
  } catch {
    // Older browsers do not expose showPicker(), but a user-initiated click
    // still opens their native date control.
    dateInput.focus();
    dateInput.click();
  }
});
dateInput.addEventListener("input", () => {
  void chooseDate(dateInput.value);
  // A date that cannot be opened leaves the selected day as it is, and the field shows that day again.
  invalidate();
});
brand.addEventListener("click", () => changeView("log"));
for (const button of navButtons) button.addEventListener("click", () => changeView(/** @type {View} */ (button.dataset.view)));
/** @type {HTMLButtonElement} */ (loadingError.lastElementChild).addEventListener("click", () => {
  setState({ message: null });
  void loadBootstrap().catch((/** @type {Error} */ error) => setState({ message: { kind: "error", text: error.message } }));
});

/** @type {{ key: string; view: ViewInstance } | null} */
let mounted = null;

// Each view names its controls with `data-action`. One listener for each event type sends the event to the open view.
for (const type of ["click", "input", "change", "submit"]) {
  main.addEventListener(type, (/** @type {Event} */ event) => {
    const element = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (!(element instanceof HTMLElement) || !main.contains(element) || element.matches(":disabled")) return;
    const handler = mounted?.view.handlers[type]?.[element.dataset.action ?? ""];
    if (!handler) return;
    handler(element, event);
    // A control that the state does not follow goes back to the value that the state has.
    invalidate();
  });
}

/** @type {Map<string, { inputs: readonly unknown[]; stop?: () => void }>} */
const watches = new Map();

/**
 * Runs `start` when a value in `inputs` is different from the last render. The function that `start` returns stops the earlier run.
 * @param {{ name: string; inputs: readonly unknown[]; start: () => void | (() => void) }} input
 */
function watch({ name, inputs, start }) {
  const previous = watches.get(name);
  if (previous && previous.inputs.length === inputs.length && previous.inputs.every((input, index) => input === inputs[index])) return;
  previous?.stop?.();
  watches.set(name, { inputs, stop: start() ?? undefined });
}

/** @param {BeforeUnloadEvent} event */
function warnBeforeUnload(event) {
  event.preventDefault();
  event.returnValue = true;
}

/** The key of the view to show. A different key makes a new view. It is null while no view can show. */
function viewKey() {
  if (!state.data) return null;
  if (state.view !== "goal") return state.view;
  if (!state.selectedGoalId || !state.goalConfigDraft) return null;
  return `goal:${state.selectedGoalId}:${state.data.goals.some((goal) => goal.id === state.selectedGoalId)}`;
}

function render() {
  const hasPendingSave = state.isSaving || state.isDeleting || state.isSavingGoalConfig
    || state.isActivityCreateBusy || state.pendingGoalKeys.size > 0 || state.pendingSelectionKeys.size > 0;
  watch({
    name: "scroll",
    inputs: [state.view, state.selectedGoalId],
    start: () => {
      window.scrollTo(0, 0);
    },
  });
  watch({
    name: "unload-warning",
    inputs: [hasPendingSave],
    start: () => {
      if (!hasPendingSave) return undefined;
      window.addEventListener("beforeunload", warnBeforeUnload);
      return () => window.removeEventListener("beforeunload", warnBeforeUnload);
    },
  });
  watch({ name: "calendar", inputs: [state.calendarMonth, state.view], start: loadCalendar });
  watch({ name: "goal-history", inputs: [state.goalHistoryMonth, state.goalHistoryRevision, state.data?.today, state.selectedGoalId, state.view], start: loadGoalHistory });

  const { data, view, selectedDate, isLoadingDate, connectionState, message } = state;
  // Leaving the current view is blocked while it has an update in flight.
  const navLocked = state.isSavingGoalConfig || state.isActivityCreateBusy || (state.isSetupBusy && view === "settings");
  // The sky behind the header takes the colour of the selected day's mood.
  const dayColor = view === "log" ? data?.moods.find((mood) => mood.id === state.draft.moodId)?.color : undefined;

  set(shell, { class: `app-shell view-${view}`, style: { "--day-color": dayColor ?? null } });
  set(brand, { disabled: navLocked });
  set(topbarDate, { class: `topbar-date ${view === "log" ? "is-log" : ""}` });
  if (view === "log" && selectedDate && data) {
    if (dateSwitcher.parentNode !== topbarDate) topbarDate.replaceChildren(dateSwitcher);
    set(previousDayButton, { disabled: isLoadingDate });
    set(dateLabel, { text: friendlyDate(selectedDate) });
    set(nextDayButton, { class: isLatestDay() ? "at-latest-day" : null, disabled: isLoadingDate || isLatestDay() });
  } else if (dateSwitcher.parentNode === topbarDate || topbarDate.textContent !== VIEW_TITLES[view]) {
    topbarDate.textContent = VIEW_TITLES[view];
  }
  set(connectionPill, {
    class: `connection-pill ${connectionState}`,
    "aria-label": `Connection: ${connectionState}`,
    html: html`${icon(connectionState === "offline" ? "cloud_off" : connectionState === "error" ? "cloud_alert" : UI_ICONS.sync)} ${connectionState === "error" ? "sync issue" : connectionState}`,
  });
  place({ node: topbarActions, present: view === "log" && Boolean(data), parent: topbar });
  if (data) {
    set(todayButton, { disabled: isLoadingDate });
    set(datePickerButton, { disabled: isLoadingDate });
    set(dateInput, { value: selectedDate, max: data.today, disabled: isLoadingDate });
  }

  // The view
  const key = viewKey();
  const isNewView = mounted?.key !== key;
  if (isNewView) {
    if (mounted) {
      mounted.view.destroy?.();
      for (const node of mounted.view.nodes) /** @type {ChildNode} */ (node).remove();
    }
    mounted = key ? { key, view: VIEWS[view](app) } : null;
    if (mounted) main.append(...mounted.view.nodes);
  }
  const firstViewNode = mounted?.view.nodes[0] ?? null;
  const showNotice = Boolean(data && message && view !== "log");
  if (message) set(shellNotice, { class: `notice ${message.kind}`, text: noticeText(message) });
  place({ node: shellNotice, present: showNotice, parent: main, before: firstViewNode });
  place({ node: loadingShell, present: !data, parent: main, before: showNotice ? shellNotice : firstViewNode });
  if (!data) {
    const error = connectionState === "error" || connectionState === "offline" ? message?.text ?? "Could not connect to your journal." : undefined;
    set(loadingShell, { "aria-busy": !error });
    if (error) set(/** @type {Element} */ (loadingError.firstElementChild), { text: error });
    place({ node: loadingError, present: Boolean(error), parent: loadingShell, before: loadingShell.querySelector(".hero-card") });
    place({ node: loadingStatus, present: !error, parent: loadingShell, before: loadingShell.querySelector(".hero-card") });
    set(loadingEyebrow, { text: view === "log" ? "Daily journal" : "Your journal" });
    set(loadingTitle, { text: view === "log" ? "How was your day?" : VIEW_TITLES[view] });
  }
  mounted?.view.update();
  if (isNewView) mounted?.view.mounted?.();

  set(nav, { "aria-busy": navLocked });
  for (const button of navButtons) {
    const active = view === button.dataset.view;
    set(button, { class: active ? "active" : "", "aria-current": active ? "page" : null, disabled: navLocked });
  }
}

// Start. The order is the order in which the React app ran its effects.
const initialRoute = routeFromLocation(window.location);
const initialHistoryState = /** @type {{ daymarkRoute?: boolean; daymarkDepth?: number } | null} */ (window.history.state);
routeDepth = initialHistoryState?.[HISTORY_STATE_KEY] && Number.isInteger(initialHistoryState.daymarkDepth) ? /** @type {number} */ (initialHistoryState.daymarkDepth) : 0;
navigationReady = true;
window.addEventListener("popstate", handlePopState);

function updateConnection() {
  setState({ connectionState: navigator.onLine ? "online" : "offline" });
}
updateConnection();
window.addEventListener("online", updateConnection);
window.addEventListener("offline", updateConnection);

window.setInterval(updateLocalDay, 60_000);
window.setInterval(() => {
  if (document.visibilityState === "visible") void refreshSelectedDay();
}, 15_000);
window.addEventListener("focus", refreshOnReturn);
document.addEventListener("visibilitychange", refreshOnReturn);

if (window.location.hostname !== "localhost" && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => undefined);
}

applyRoute(initialRoute, { replace: true });
loadBootstrap().catch((/** @type {Error} */ error) => {
  if (error.name !== "AbortError") setState({ message: { kind: "error", text: error.message } });
});
render();
