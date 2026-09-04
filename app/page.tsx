"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type Activity,
  type ActivityGroup,
  type Bootstrap,
  type CalendarEntryDay,
  type DaySelections,
  type Entry,
  type Goal,
  type GoalHistory,
  type GoalRepeatType,
  type Mood,
  ALL_WEEKDAYS_MASK,
  goalRepeatType,
  goalWeekdayMask,
  isLogicalDate,
  logicalDateFromDate,
} from "../lib/daylio";
import {
  clearStoredDraft,
  readActiveStoredDraft,
  recoverStoredDraft,
  rememberDraftDate,
  type Draft,
  writeStoredDraft,
} from "../lib/draft-storage";
import { UI_ICONS } from "../lib/icons";
import {
  filterActivityGroups,
  summarizeActivityGroup,
} from "../lib/activity-groups";
import { createLatestRequestGate } from "../lib/latest-request-gate";
import { Icon } from "./components/icon";
import { IconPicker, SetupView } from "./components/setup-view";

type View = "log" | "calendar" | "settings" | "goal" | "add-activity";
type ActivityCreationSource = "log" | "settings";
type ConnectionState = "checking" | "online" | "offline" | "error";
type Notice = { kind: "success" | "error" | "info"; text: string };
type Route = { view: View; goalId?: string; groupId?: string; returnView?: ActivityCreationSource };

const HISTORY_STATE_KEY = "daymarkRoute";

function routeFromLocation(location: Location): Route {
  const params = new URLSearchParams(location.search);
  const requestedView = params.get("view");
  if (requestedView === "goal" && params.get("goal")) return { view: "goal", goalId: params.get("goal")! };
  if (requestedView === "add-activity" || requestedView === "activity") {
    return {
      view: "add-activity",
      groupId: params.get("group") ?? params.get("groupId") ?? undefined,
      returnView: params.get("from") === "settings" ? "settings" : "log",
    };
  }
  if (requestedView === "entries") return { view: "calendar" };
  if (requestedView === "calendar" || requestedView === "settings") {
    return { view: requestedView };
  }
  return { view: "log" };
}

function routeUrl(route: Route) {
  const url = new URL(window.location.href);
  if (route.view === "log") url.searchParams.delete("view");
  else url.searchParams.set("view", route.view);
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

const EMPTY_DRAFT: Draft = {
  moodId: "",
  activityIds: [],
  completedGoalIds: [],
  localTime: "23:00",
};

type GoalConfigDraft = {
  name: string;
  activityId: string | null;
  repeatType: GoalRepeatType;
  weekdaysMask: number;
  targetPerWeek: number;
  materialIcon: string;
};

function goalConfigFromGoal(goal: Goal): GoalConfigDraft {
  return {
    name: goal.name,
    activityId: goal.activityId,
    repeatType: goalRepeatType(goal),
    weekdaysMask: goalWeekdayMask(goal),
    targetPerWeek: Math.min(7, Math.max(1, goal.targetPerWeek ?? 1)),
    materialIcon: goal.materialIcon,
  };
}

function friendlyDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function shortDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(year, month - 1, day));
}

function getEntryForDate(entries: Entry[], date: string) {
  return entries.find(
    (entry) => entry.logicalDate === date && !entry.deletedAt,
  );
}

function draftFromEntry(entry: Entry | null): Draft {
  if (!entry) return { ...EMPTY_DRAFT };
  return {
    moodId: entry.moodId,
    activityIds: [...entry.activityIds],
    completedGoalIds: [...entry.completedGoalIds],
    localTime: entry.localTime,
    version: entry.version,
  };
}

function draftForDate({
  logicalDate,
  serverEntry,
  serverCompletedGoalIds = serverEntry?.completedGoalIds ?? [],
  serverSelections,
}: {
  logicalDate: string;
  serverEntry: Entry | null;
  serverCompletedGoalIds?: string[];
  serverSelections?: DaySelections;
}) {
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
    if (serverSelections?.moodOverride)
      recoveredDraft.moodId = baseDraft.moodId;
    if (serverSelections && serverSelections.activityOverrideIds.length > 0) {
      const activityIds = new Set(recoveredDraft.activityIds);
      for (const activityId of serverSelections.activityOverrideIds) {
        if (serverSelections.activityIds.includes(activityId))
          activityIds.add(activityId);
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

function moodFor(moods: Mood[], id: string) {
  return moods.find((mood) => mood.id === id);
}

function activityFor(activities: Activity[], id?: string | null) {
  return activities.find((activity) => activity.id === id);
}

function resolveActiveActivityGroupId({
  groups,
  requestedId,
}: {
  groups: readonly ActivityGroup[];
  requestedId?: string;
}) {
  return groups.find((group) => group.id === requestedId && !group.archived)?.id
    ?? groups.find((group) => !group.archived)?.id
    ?? "";
}

function applyGoalCompletionStates({
  completedGoalIds,
  completions,
}: {
  completedGoalIds: string[];
  completions: Array<{ goalId: string; completed: boolean }>;
}) {
  const next = new Set(completedGoalIds);
  for (const completion of completions) {
    if (completion.completed) next.add(completion.goalId);
    else next.delete(completion.goalId);
  }
  return [...next];
}

function applyActivitySelectionStates({
  activityIds,
  selections,
}: {
  activityIds: string[];
  selections: Array<{ activityId: string; selected: boolean }>;
}) {
  const next = new Set(activityIds);
  for (const selection of selections) {
    if (selection.selected) next.add(selection.activityId);
    else next.delete(selection.activityId);
  }
  return [...next];
}

function restoreGoalCompletionStates({
  completedGoalIds,
  previousStates,
}: {
  completedGoalIds: string[];
  previousStates: Map<string, boolean>;
}) {
  const next = new Set(completedGoalIds);
  for (const [goalId, completed] of previousStates) {
    if (completed) next.add(goalId);
    else next.delete(goalId);
  }
  return [...next];
}

export default function Home() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [view, setView] = useState<View>("log");
  const [selectedDate, setSelectedDate] = useState("");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [activityQuery, setActivityQuery] = useState("");
  const [isLoadingDate, setIsLoadingDate] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSetupBusy, setIsSetupBusy] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState("");
  const [calendarDays, setCalendarDays] = useState<CalendarEntryDay[]>([]);
  const [isLoadingCalendar, setIsLoadingCalendar] = useState(false);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [goalHistoryMonth, setGoalHistoryMonth] = useState("");
  const [goalHistory, setGoalHistory] = useState<GoalHistory | null>(null);
  const [goalHistoryRevision, setGoalHistoryRevision] = useState(0);
  const [isLoadingGoalHistory, setIsLoadingGoalHistory] = useState(false);
  const [goalConfigDraft, setGoalConfigDraft] = useState<GoalConfigDraft | null>(null);
  const [isSavingGoalConfig, setIsSavingGoalConfig] = useState(false);
  const [goalIconPickerOpen, setGoalIconPickerOpen] = useState(false);
  const [activityGroupId, setActivityGroupId] = useState<string | undefined>();
  const [activityReturnView, setActivityReturnView] = useState<ActivityCreationSource>("log");
  const [isActivityCreateBusy, setIsActivityCreateBusy] = useState(false);
  const [hasLocalDraft, setHasLocalDraft] = useState(false);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("checking");
  const [message, setMessage] = useState<Notice | null>(null);
  const [pendingGoalKeys, setPendingGoalKeys] = useState<Set<string>>(
    new Set(),
  );
  const [pendingSelectionKeys, setPendingSelectionKeys] = useState<Set<string>>(
    new Set(),
  );
  const draftRef = useRef(EMPTY_DRAFT);
  const dateRequestGate = useRef(createLatestRequestGate());
  const bootstrapRequestGate = useRef(createLatestRequestGate());
  const goalHistoryRequestGate = useRef(createLatestRequestGate());
  const pendingGoalConfigRef = useRef(false);
  const goalConfigSaveSequenceRef = useRef(0);
  const activeGoalConfigSaveRef = useRef<{ sequence: number; goalId: string } | null>(null);
  const selectedGoalIdRef = useRef<string | null>(null);
  const activityReturnViewRef = useRef<ActivityCreationSource>("log");
  const activityGroupIdRef = useRef<string | undefined>(undefined);
  const activityCreateBusyRef = useRef(false);
  const pendingRouteNoticeRef = useRef<Notice | null>(null);
  const pendingGoalRef = useRef<Set<string>>(new Set());
  const pendingSelectionRef = useRef<Set<string>>(new Set());
  const failedSelectionRef = useRef<Set<string>>(new Set());
  const hasLocalDraftRef = useRef(false);
  const selectedDateRef = useRef("");
  const selectedDateEpochRef = useRef(0);
  const dataRef = useRef<Bootstrap | null>(null);
  const viewRef = useRef<View>(view);
  const setupBusyRef = useRef(false);
  const navigationReadyRef = useRef(false);
  const routeDepthRef = useRef(0);
  draftRef.current = draft;
  dataRef.current = data;
  viewRef.current = view;
  setupBusyRef.current = isSetupBusy;
  selectedGoalIdRef.current = selectedGoalId;
  activityReturnViewRef.current = activityReturnView;
  activityGroupIdRef.current = activityGroupId;
  activityCreateBusyRef.current = isActivityCreateBusy;

  function markLocalDraft(value: boolean) {
    hasLocalDraftRef.current = value;
    setHasLocalDraft(value);
  }

  function setActivityCreateBusy(busy: boolean) {
    activityCreateBusyRef.current = busy;
    setIsActivityCreateBusy(busy);
  }

  function updateGoalRoute(goalId: string | null) {
    if (goalId) {
      const goal = dataRef.current?.goals.find((candidate) => candidate.id === goalId && !candidate.archived);
      if (dataRef.current && !goal) return false;
      setSelectedGoalId(goalId);
      setGoalConfigDraft(goal ? goalConfigFromGoal(goal) : null);
      setGoalHistory(null);
      setGoalHistoryMonth((selectedDateRef.current || dataRef.current?.today || logicalDateFromDate()).slice(0, 7));
    } else {
      goalHistoryRequestGate.current.cancel();
      setGoalIconPickerOpen(false);
      setSelectedGoalId(null);
      setGoalHistory(null);
      setGoalConfigDraft(null);
    }
    return true;
  }

  function writeRoute(route: Route, { replace = false }: { replace?: boolean } = {}) {
    if (typeof window === "undefined") return;
    const depth = replace ? routeDepthRef.current : routeDepthRef.current + 1;
    const state = { ...(window.history.state ?? {}), [HISTORY_STATE_KEY]: true, daymarkView: route.view, daymarkGoalId: route.goalId ?? null, daymarkDepth: depth };
    if (replace) window.history.replaceState(state, "", routeUrl(route));
    else window.history.pushState(state, "", routeUrl(route));
    routeDepthRef.current = depth;
  }

  function restoreCurrentRoute() {
    const currentView = viewRef.current;
    writeRoute({
      view: currentView,
      goalId: currentView === "goal" ? selectedGoalIdRef.current ?? undefined : undefined,
      groupId: currentView === "add-activity" ? activityGroupIdRef.current : undefined,
      returnView: currentView === "add-activity" ? activityReturnViewRef.current : undefined,
    });
  }

  function applyRoute(route: Route, { replace = false }: { replace?: boolean } = {}) {
    const routeNotice = pendingRouteNoticeRef.current;
    pendingRouteNoticeRef.current = null;
    if (route.view === "goal" && !route.goalId) route = { view: "log" };
    if (route.view === "goal" && !updateGoalRoute(route.goalId!)) {
      route = { view: "log" };
      replace = true;
    }
    if (route.view === "add-activity") {
      const returnView = route.returnView === "settings" ? "settings" : "log";
      const groupId = dataRef.current
        ? resolveActiveActivityGroupId({ groups: dataRef.current.groups, requestedId: route.groupId }) || undefined
        : route.groupId;
      if (dataRef.current && (groupId !== route.groupId || returnView !== route.returnView)) replace = true;
      route = { ...route, groupId, returnView };
      setActivityGroupId(groupId);
      setActivityReturnView(returnView);
    }
    if (route.view !== "goal") updateGoalRoute(null);
    setView(route.view);
    setMessage(routeNotice);
    if (replace) writeRoute(route, { replace: true });
  }

  function changeView(nextView: View, { goalId, groupId, returnView }: { goalId?: string; groupId?: string; returnView?: ActivityCreationSource } = {}) {
    if (activityCreateBusyRef.current && viewRef.current === "add-activity" && nextView !== "add-activity") {
      setMessage({ kind: "info", text: "Wait for the activity update to finish before leaving this view." });
      return;
    }
    if (isSetupBusy && view === "settings" && nextView !== "settings") return;
    if (pendingGoalConfigRef.current && view === "goal" && nextView !== "goal") {
      setMessage({ kind: "info", text: "Wait for the goal update to finish before leaving this goal." });
      return;
    }
    const nextGoalId = nextView === "goal" ? goalId ?? selectedGoalId : undefined;
    if (nextView === "goal" && !nextGoalId) return;
    if (nextView === view && (nextView !== "goal" || nextGoalId === selectedGoalId)) return;
    const nextReturnView = nextView === "add-activity" ? returnView ?? (view === "settings" ? "settings" : "log") : undefined;
    const nextGroupId = nextView === "add-activity"
      ? groupId ?? (dataRef.current ? resolveActiveActivityGroupId({ groups: dataRef.current.groups }) || undefined : undefined)
      : undefined;
    if (nextView === "goal") updateGoalRoute(nextGoalId!);
    else updateGoalRoute(null);
    if (nextView === "add-activity") {
      setActivityGroupId(nextGroupId);
      setActivityReturnView(nextReturnView!);
    }
    writeRoute({ view: nextView, goalId: nextGoalId ?? undefined, groupId: nextGroupId, returnView: nextReturnView });
    setView(nextView);
    setMessage(null);
  }

  function openGoal(goalId: string) {
    if (pendingGoalConfigRef.current) return;
    const goal = data?.goals.find((candidate) => candidate.id === goalId && !candidate.archived);
    if (!goal) return;
    setSelectedGoalId(goalId);
    setGoalConfigDraft(goalConfigFromGoal(goal));
    setGoalHistory(null);
    setGoalHistoryMonth((selectedDate || data?.today || "").slice(0, 7));
    changeView("goal", { goalId });
  }

  function closeGoal() {
    if (pendingGoalConfigRef.current) {
      setMessage({ kind: "info", text: "Wait for the goal update to finish before leaving this goal." });
      return;
    }
    if (navigationReadyRef.current && routeDepthRef.current > 0) {
      window.history.back();
      return;
    }
    updateGoalRoute(null);
    setView("log");
    writeRoute({ view: "log" }, { replace: true });
  }

  function closeAddActivity(notice?: Notice) {
    if (activityCreateBusyRef.current && !notice) {
      setMessage({ kind: "info", text: "Wait for the activity update to finish before leaving this view." });
      return;
    }
    pendingRouteNoticeRef.current = notice ?? null;
    if (navigationReadyRef.current && routeDepthRef.current > 0) {
      window.history.back();
      return;
    }
    applyRoute({ view: activityReturnViewRef.current }, { replace: true });
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const initialRoute = routeFromLocation(window.location);
    const initialState = window.history.state as { [HISTORY_STATE_KEY]?: boolean; daymarkDepth?: number } | null;
    routeDepthRef.current = initialState?.[HISTORY_STATE_KEY] && Number.isInteger(initialState.daymarkDepth) ? initialState.daymarkDepth! : 0;
    navigationReadyRef.current = true;
    Promise.resolve().then(() => applyRoute(initialRoute, { replace: true }));

    function handlePopState(event: PopStateEvent) {
      const nextRoute = routeFromLocation(window.location);
      const isLegacyEntriesRoute = new URLSearchParams(window.location.search).get("view") === "entries";
      const nextState = event.state as { [HISTORY_STATE_KEY]?: boolean; daymarkDepth?: number } | null;
      routeDepthRef.current = nextState?.[HISTORY_STATE_KEY] && Number.isInteger(nextState.daymarkDepth) ? nextState.daymarkDepth! : 0;
      if (pendingGoalConfigRef.current && viewRef.current === "goal" && (nextRoute.view !== "goal" || nextRoute.goalId !== selectedGoalIdRef.current)) {
        setMessage({ kind: "info", text: "Wait for the goal update to finish before leaving this goal." });
        restoreCurrentRoute();
        return;
      }
      if (setupBusyRef.current && viewRef.current === "settings" && nextRoute.view !== "settings") {
        setMessage({ kind: "info", text: "Wait for the setup update to finish before leaving setup." });
        restoreCurrentRoute();
        return;
      }
      if (activityCreateBusyRef.current && viewRef.current === "add-activity" && nextRoute.view !== "add-activity" && !pendingRouteNoticeRef.current) {
        setMessage({ kind: "info", text: "Wait for the activity update to finish before leaving this view." });
        restoreCurrentRoute();
        return;
      }
      applyRoute(nextRoute, { replace: isLegacyEntriesRoute });
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
    // The listener reads changing route data from refs and must be installed only once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyBootstrap(
    next: Bootstrap,
    preferredDate: string,
    announceRestore = false,
  ) {
    const nextDate =
      preferredDate || readActiveStoredDraft()?.logicalDate || next.today;
    const recovered = draftForDate({
      logicalDate: nextDate,
      serverEntry: getEntryForDate(next.entries, nextDate) ?? null,
    });
    rememberDraftDate(nextDate);
    selectedDateRef.current = nextDate;
    setData(next);
    setSelectedDate(nextDate);
    setCalendarMonth((current) => current || nextDate.slice(0, 7));
    setDraft(recovered.draft);
    markLocalDraft(recovered.restored);
    if (viewRef.current === "goal" && selectedGoalIdRef.current) {
      const goal = next.goals.find((candidate) => candidate.id === selectedGoalIdRef.current && !candidate.archived);
      if (goal) {
        if (!goalConfigDraft) setGoalConfigDraft(goalConfigFromGoal(goal));
      } else {
        updateGoalRoute(null);
        setView("log");
        writeRoute({ view: "log" }, { replace: true });
      }
    }
    if (announceRestore && recovered.restored)
      setMessage({
        kind: "info",
        text: `Restored unsaved changes for ${shortDate(nextDate)}.`,
      });
    void chooseDate(nextDate);
  }

  async function loadBootstrap() {
    const request = bootstrapRequestGate.current.begin();
    setConnectionState("checking");
    try {
      const response = await fetch("/api/bootstrap", {
        cache: "no-store",
        signal: request.signal,
      });
      if (!response.ok) throw new Error("Could not connect to your journal.");
      const next = (await response.json()) as Bootstrap;
      if (request.isCurrent()) {
        applyBootstrap(next, selectedDate || next.today);
        setConnectionState("online");
      }
      return next;
    } catch (error) {
      if (request.isCurrent() && !request.signal.aborted)
        setConnectionState(navigator.onLine ? "error" : "offline");
      throw error;
    }
  }

  useEffect(() => {
    const request = bootstrapRequestGate.current.begin();
    let cancelled = false;
    fetch("/api/bootstrap", { cache: "no-store", signal: request.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not connect to your journal.");
        return (await response.json()) as Bootstrap;
      })
      .then((next) => {
        if (cancelled || !request.isCurrent()) return;
        applyBootstrap(next, "", true);
        setConnectionState("online");
      })
      .catch((error: Error) => {
        if (!cancelled && request.isCurrent() && !request.signal.aborted) {
          setConnectionState(navigator.onLine ? "error" : "offline");
          setMessage({ kind: "error", text: error.message });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function updateConnection() {
      setConnectionState(navigator.onLine ? "online" : "offline");
    }
    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);

  useEffect(() => {
    if (
      window.location.hostname !== "localhost" &&
      "serviceWorker" in navigator
    ) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  useEffect(
    () => () => {
      dateRequestGate.current.cancel();
      bootstrapRequestGate.current.cancel();
      goalHistoryRequestGate.current.cancel();
    },
    [],
  );

  useEffect(() => {
    if (view !== "calendar" || !/^\d{4}-\d{2}$/.test(calendarMonth)) return;
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        if (cancelled) return null;
        setIsLoadingCalendar(true);
        setCalendarDays([]);
        return fetch(`/api/calendar?month=${calendarMonth}`, {
          cache: "no-store",
        });
      })
      .then(async (response) => {
        if (!response) return null;
        if (!response.ok) throw new Error("Could not load that month.");
        return (await response.json()) as {
          days?: CalendarEntryDay[];
          dates?: string[];
        };
      })
      .then((result) => {
        if (result && !cancelled) {
          setCalendarDays(
            result.days ?? (result.dates ?? []).map((logicalDate) => ({ logicalDate, moodId: "" })),
          );
          setConnectionState("online");
          setMessage(null);
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setConnectionState(navigator.onLine ? "error" : "offline");
          setMessage({ kind: "error", text: error.message });
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingCalendar(false);
      });
    return () => {
      cancelled = true;
    };
  }, [calendarMonth, view]);

  useEffect(() => {
    if (view !== "goal" || !selectedGoalId || !/^\d{4}-\d{2}$/.test(goalHistoryMonth)) return;
    const gate = goalHistoryRequestGate.current;
    const request = gate.begin();
    Promise.resolve()
      .then(() => {
        if (!request.isCurrent()) return null;
        setIsLoadingGoalHistory(true);
        const search = new URLSearchParams({ month: goalHistoryMonth, asOf: logicalDateFromDate() });
        return fetch(`/api/goals/${selectedGoalId}/history?${search}`, { cache: "no-store", signal: request.signal });
      })
      .then(async (response) => {
        if (!response) return null;
        const result = (await response.json()) as GoalHistory & { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Could not load goal history.");
        return result;
      })
      .then((result) => {
        if (!result || !request.isCurrent()) return;
        setGoalHistory(result);
        setConnectionState("online");
      })
      .catch((error: Error) => {
        if (request.signal.aborted || !request.isCurrent()) return;
        setConnectionState(navigator.onLine ? "error" : "offline");
        setMessage({ kind: "error", text: error.message });
      })
      .finally(() => {
        if (request.isCurrent()) setIsLoadingGoalHistory(false);
    });
    return () => {
      if (!request.signal.aborted) gate.cancel();
    };
  }, [goalHistoryMonth, goalHistoryRevision, selectedGoalId, view]);

  async function chooseDate(nextDate: string) {
    if (!isLogicalDate(nextDate)) return;
    if (selectedDateRef.current && hasPendingGoalToggle(selectedDateRef.current)) {
      setMessage({
        kind: "info",
        text: "Wait for the goal update to finish before changing the day.",
      });
      return;
    }
    if (
      selectedDateRef.current &&
      hasPendingSelectionToggle(selectedDateRef.current)
    ) {
      setMessage({
        kind: "info",
        text: "Wait for the mood or activity update to finish before changing the day.",
      });
      return;
    }
    const request = dateRequestGate.current.begin();
    rememberDraftDate(nextDate);
    selectedDateRef.current = nextDate;
    selectedDateEpochRef.current += 1;
    setSelectedDate(nextDate);
    setCalendarMonth(nextDate.slice(0, 7));
    setMessage(null);
    setIsLoadingDate(true);
    try {
      const response = await fetch(`/api/entries/${nextDate}`, {
        cache: "no-store",
        signal: request.signal,
      });
      let serverEntry: Entry | null = null;
      let serverCompletedGoalIds: string[] = [];
      let serverSelections: DaySelections | undefined;
      if (response.status !== 404) {
        if (!response.ok) throw new Error("Could not load that date.");
        const result = (await response.json()) as {
          entry: Entry;
          completedGoalIds?: string[];
          daySelections?: DaySelections;
        };
        serverEntry = result.entry;
        serverCompletedGoalIds =
          result.completedGoalIds ?? serverEntry.completedGoalIds;
        serverSelections = result.daySelections;
      } else {
        const result = (await response.json()) as {
          completedGoalIds?: string[];
          daySelections?: DaySelections;
        };
        serverCompletedGoalIds = result.completedGoalIds ?? [];
        serverSelections = result.daySelections;
      }
      if (!request.isCurrent()) return;
      const recovered = draftForDate({
        logicalDate: nextDate,
        serverEntry,
        serverCompletedGoalIds,
        serverSelections,
      });
      setDraft(recovered.draft);
      markLocalDraft(recovered.restored);
      if (serverEntry)
        setData((current) =>
          current
            ? {
                ...current,
                entries: [
                  serverEntry!,
                  ...current.entries.filter(
                    (entry) => entry.logicalDate !== nextDate,
                  ),
                ],
              }
            : current,
        );
      setConnectionState("online");
      if (recovered.restored)
        setMessage({
          kind: "info",
          text: `Restored unsaved changes for ${shortDate(nextDate)}.`,
        });
    } catch (error) {
      if (request.signal.aborted || !request.isCurrent()) return;
      setConnectionState(navigator.onLine ? "error" : "offline");
      setMessage({ kind: "error", text: (error as Error).message });
    } finally {
      if (request.isCurrent()) setIsLoadingDate(false);
    }
  }

  function updateDraft(
    patch: Partial<Draft>,
    { markLocal = true }: { markLocal?: boolean } = {},
  ) {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setDraft(next);
    if (selectedDate) writeStoredDraft(selectedDate, next);
    if (markLocal) markLocalDraft(true);
    setMessage(null);
  }

  function selectionPendingKey(logicalDate: string, kind: "mood" | "activity", id?: string) {
    return `${logicalDate}:${kind}:${id ?? ""}`;
  }

  function setSelectionPending(key: string, pending: boolean) {
    setPendingSelectionKeys((current) => {
      const next = new Set(current);
      if (pending) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function hasPendingSelectionToggle(logicalDate: string) {
    const prefix = `${logicalDate}:`;
    return [...pendingSelectionRef.current].some((key) => key.startsWith(prefix));
  }

  async function toggleMood(id: string) {
    const logicalDate = selectedDateRef.current || selectedDate;
    const key = selectionPendingKey(logicalDate, "mood");
    if (!logicalDate || isLoadingDate || pendingSelectionRef.current.has(key)) return;
    const previousMoodId = draftRef.current.moodId;
    if (previousMoodId === id) return;
    const nextDraft = { ...draftRef.current, moodId: id };
    const dateEpoch = selectedDateEpochRef.current;
    pendingSelectionRef.current.add(key);
    setSelectionPending(key, true);
    updateDraft({ moodId: id }, { markLocal: false });
    try {
      const response = await fetch(`/api/day-selections/${logicalDate}/mood`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ moodId: id }),
      });
      const result = (await response.json()) as {
        selection?: { moodId: string };
        error?: string;
      };
      if (!response.ok || !result.selection || result.selection.moodId !== id)
        throw new Error(result.error ?? "The mood update was out of date.");
      failedSelectionRef.current.delete(key);
      if (selectedDateRef.current === logicalDate && selectedDateEpochRef.current === dateEpoch) {
        setData((current) =>
          current
            ? {
                ...current,
                entries: current.entries.map((entry) =>
                  entry.logicalDate === logicalDate ? { ...entry, moodId: id } : entry,
                ),
              }
            : current,
        );
        const hasOtherPendingSelection = [...pendingSelectionRef.current].some(
          (pendingKey) => pendingKey !== key && pendingKey.startsWith(`${logicalDate}:`),
        );
        if (!hasOtherPendingSelection && !hasLocalDraftRef.current) {
          clearStoredDraft(logicalDate);
          markLocalDraft(false);
        }
        const hasFailedSelection = [...failedSelectionRef.current].some(
          (failedKey) => failedKey.startsWith(`${logicalDate}:`),
        );
        if (!hasFailedSelection) {
          setConnectionState("online");
          setMessage(null);
        }
      }
    } catch (error) {
      failedSelectionRef.current.add(key);
      if (selectedDateRef.current === logicalDate && selectedDateEpochRef.current === dateEpoch) {
        updateDraft({ moodId: previousMoodId }, { markLocal: false });
        writeStoredDraft(logicalDate, draftRef.current);
        markLocalDraft(true);
        setConnectionState(navigator.onLine ? "error" : "offline");
        setMessage({ kind: "error", text: `${(error as Error).message} The mood was restored.` });
      } else writeStoredDraft(logicalDate, nextDraft);
    } finally {
      pendingSelectionRef.current.delete(key);
      setSelectionPending(key, false);
    }
  }

  async function toggleActivity(id: string) {
    const logicalDate = selectedDateRef.current || selectedDate;
    const key = selectionPendingKey(logicalDate, "activity", id);
    if (!logicalDate || isLoadingDate || pendingSelectionRef.current.has(key)) return;
    const linkedGoalIds = data?.goals
      .filter((goal) => !goal.archived && goal.activityId === id)
      .map((goal) => goal.id) ?? [];
    const linkedGoalKeys = linkedGoalIds.map((goalId) => goalPendingKey(logicalDate, goalId));
    const previousSelected = draftRef.current.activityIds.includes(id);
    const nextSelected = !previousSelected;
    const nextActivityIds = nextSelected
      ? [...new Set([...draftRef.current.activityIds, id])]
      : draftRef.current.activityIds.filter((item) => item !== id);
    const previousGoalStates = new Map(
      linkedGoalIds.map((goalId) => [goalId, draftRef.current.completedGoalIds.includes(goalId)]),
    );
    const nextCompletedGoalIds = applyGoalCompletionStates({
      completedGoalIds: draftRef.current.completedGoalIds,
      completions: linkedGoalIds.map((goalId) => ({ goalId, completed: nextSelected })),
    });
    const nextDraft = {
      ...draftRef.current,
      activityIds: nextActivityIds,
      completedGoalIds: nextCompletedGoalIds,
    };
    const dateEpoch = selectedDateEpochRef.current;
    pendingSelectionRef.current.add(key);
    for (const goalKey of linkedGoalKeys) pendingGoalRef.current.add(goalKey);
    setSelectionPending(key, true);
    for (const goalKey of linkedGoalKeys) setGoalPending(goalKey, true);
    updateDraft(
      { activityIds: nextActivityIds, completedGoalIds: nextCompletedGoalIds },
      { markLocal: false },
    );
    try {
      const response = await fetch(`/api/day-selections/${logicalDate}/activities/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ selected: nextSelected }),
      });
      const result = (await response.json()) as {
        selection?: { activityId: string; selected: boolean };
        affectedGoalCompletions?: Array<{ goalId: string; completed: boolean }>;
        affectedActivitySelections?: Array<{ activityId: string; selected: boolean }>;
        error?: string;
      };
      if (!response.ok || !result.selection || result.selection.activityId !== id || result.selection.selected !== nextSelected)
        throw new Error(result.error ?? "The activity update was out of date.");
      const affectedGoalCompletions = result.affectedGoalCompletions ?? [];
      const affectedActivitySelections = result.affectedActivitySelections ?? [result.selection];
      if (
        affectedGoalCompletions.length !== linkedGoalIds.length ||
        linkedGoalIds.some(
          (goalId) =>
            !affectedGoalCompletions.some(
              (completion) => completion.goalId === goalId && completion.completed === nextSelected,
            ),
        )
      )
        throw new Error("The activity update was out of date.");
      failedSelectionRef.current.delete(key);
      if (selectedDateRef.current === logicalDate && selectedDateEpochRef.current === dateEpoch) {
        updateDraft(
          {
            activityIds: applyActivitySelectionStates({
              activityIds: draftRef.current.activityIds,
              selections: affectedActivitySelections,
            }),
            completedGoalIds: applyGoalCompletionStates({
              completedGoalIds: draftRef.current.completedGoalIds,
              completions: affectedGoalCompletions,
            }),
          },
          { markLocal: false },
        );
        setData((current) =>
          current
            ? {
                ...current,
                entries: current.entries.map((entry) =>
                  entry.logicalDate === logicalDate
                    ? {
                        ...entry,
                        activityIds: applyActivitySelectionStates({
                          activityIds: entry.activityIds,
                          selections: affectedActivitySelections,
                        }),
                        completedGoalIds: applyGoalCompletionStates({
                          completedGoalIds: entry.completedGoalIds,
                          completions: affectedGoalCompletions,
                        }),
                      }
                    : entry,
                ),
              }
            : current,
        );
        const hasOtherPendingSelection = [...pendingSelectionRef.current].some(
          (pendingKey) => pendingKey !== key && pendingKey.startsWith(`${logicalDate}:`),
        );
        if (!hasOtherPendingSelection && !hasLocalDraftRef.current) {
          clearStoredDraft(logicalDate);
          markLocalDraft(false);
        }
        const hasFailedSelection = [...failedSelectionRef.current].some(
          (failedKey) => failedKey.startsWith(`${logicalDate}:`),
        );
        if (!hasFailedSelection) {
          setConnectionState("online");
          setMessage(null);
        }
      }
    } catch (error) {
      failedSelectionRef.current.add(key);
      if (selectedDateRef.current === logicalDate && selectedDateEpochRef.current === dateEpoch) {
        updateDraft(
          {
            activityIds: previousSelected
              ? [...new Set([...draftRef.current.activityIds, id])]
              : draftRef.current.activityIds.filter((item) => item !== id),
            completedGoalIds: restoreGoalCompletionStates({
              completedGoalIds: draftRef.current.completedGoalIds,
              previousStates: previousGoalStates,
            }),
          },
          { markLocal: false },
        );
        writeStoredDraft(logicalDate, draftRef.current);
        markLocalDraft(true);
        setConnectionState(navigator.onLine ? "error" : "offline");
        setMessage({ kind: "error", text: `${(error as Error).message} The activity was restored.` });
      } else writeStoredDraft(logicalDate, nextDraft);
    } finally {
      pendingSelectionRef.current.delete(key);
      setSelectionPending(key, false);
      for (const goalKey of linkedGoalKeys) {
        pendingGoalRef.current.delete(goalKey);
        setGoalPending(goalKey, false);
      }
    }
  }

  function goalPendingKey(logicalDate: string, goalId: string) {
    return `${logicalDate}:${goalId}`;
  }

  function setGoalPending(key: string, pending: boolean) {
    setPendingGoalKeys((current) => {
      const next = new Set(current);
      if (pending) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function hasPendingGoalToggle(logicalDate: string) {
    const prefix = `${logicalDate}:`;
    return [...pendingGoalRef.current].some((key) => key.startsWith(prefix));
  }

  async function toggleGoal(id: string) {
    const logicalDate = selectedDateRef.current || selectedDate;
    const key = goalPendingKey(logicalDate, id);
    if (!logicalDate || isLoadingDate || pendingGoalRef.current.has(key))
      return;
    if (!navigator.onLine) {
      setMessage({
        kind: "error",
        text: "You’re offline. Reconnect before updating a goal.",
      });
      setConnectionState("offline");
      return;
    }
    const linkedActivityId = data?.goals.find((goal) => goal.id === id)?.activityId ?? null;
    const affectedGoalIds = linkedActivityId
      ? data?.goals.filter((goal) => !goal.archived && goal.activityId === linkedActivityId).map((goal) => goal.id) ?? [id]
      : [id];
    const affectedGoalKeys = affectedGoalIds.map((goalId) => goalPendingKey(logicalDate, goalId));
    const activityKey = linkedActivityId
      ? selectionPendingKey(logicalDate, "activity", linkedActivityId)
      : null;
    const previousChecked = draftRef.current.completedGoalIds.includes(id);
    const nextChecked = !previousChecked;
    const previousGoalStates = new Map(
      affectedGoalIds.map((goalId) => [goalId, draftRef.current.completedGoalIds.includes(goalId)]),
    );
    const previousActivitySelected = linkedActivityId
      ? draftRef.current.activityIds.includes(linkedActivityId)
      : undefined;
    const nextCompletedGoalIds = applyGoalCompletionStates({
      completedGoalIds: draftRef.current.completedGoalIds,
      completions: affectedGoalIds.map((goalId) => ({ goalId, completed: nextChecked })),
    });
    const nextActivityIds = linkedActivityId
      ? applyActivitySelectionStates({
          activityIds: draftRef.current.activityIds,
          selections: [{ activityId: linkedActivityId, selected: nextChecked }],
        })
      : draftRef.current.activityIds;
    const dateEpoch = selectedDateEpochRef.current;
    for (const goalKey of affectedGoalKeys) {
      pendingGoalRef.current.add(goalKey);
      setGoalPending(goalKey, true);
    }
    if (activityKey) {
      pendingSelectionRef.current.add(activityKey);
      setSelectionPending(activityKey, true);
    }
    setDraft((current) => {
      const next = {
        ...current,
        completedGoalIds: nextCompletedGoalIds,
        activityIds: nextActivityIds,
      };
      draftRef.current = next;
      return next;
    });
    try {
      const response = await fetch(
        `/api/goal-completions/${logicalDate}/${id}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ completed: nextChecked }),
        },
      );
      const result = (await response.json()) as {
        completion?: { goalId: string; completed: boolean };
        selection?: { activityId: string; selected: boolean };
        affectedGoalCompletions?: Array<{ goalId: string; completed: boolean }>;
        affectedActivitySelections?: Array<{ activityId: string; selected: boolean }>;
        error?: string;
      };
      if (
        !response.ok ||
        !result.completion ||
        result.completion.goalId !== id ||
        result.completion.completed !== nextChecked
      )
        throw new Error(result.error ?? "The goal update was out of date.");
      const affectedGoalCompletions = result.affectedGoalCompletions ?? [result.completion];
      const affectedActivitySelections = result.affectedActivitySelections ?? (result.selection ? [result.selection] : []);
      if (
        affectedGoalCompletions.length !== affectedGoalIds.length ||
        affectedGoalIds.some(
          (goalId) =>
            !affectedGoalCompletions.some(
              (completion) => completion.goalId === goalId && completion.completed === nextChecked,
            ),
        ) ||
        (linkedActivityId &&
          !affectedActivitySelections.some(
            (selection) => selection.activityId === linkedActivityId && selection.selected === nextChecked,
          ))
      )
        throw new Error("The goal update was out of date.");
      if (
        selectedDateRef.current === logicalDate &&
        selectedDateEpochRef.current === dateEpoch &&
        result.completion.completed === nextChecked
      ) {
        setDraft((current) => {
          const next = {
            ...current,
            completedGoalIds: applyGoalCompletionStates({
              completedGoalIds: current.completedGoalIds,
              completions: affectedGoalCompletions,
            }),
            activityIds: applyActivitySelectionStates({
              activityIds: current.activityIds,
              selections: affectedActivitySelections,
            }),
          };
          draftRef.current = next;
          return next;
        });
        setData((current) =>
          current
            ? {
                ...current,
                entries: current.entries.map((entry) =>
                  entry.logicalDate === logicalDate
                    ? {
                        ...entry,
                        completedGoalIds: applyGoalCompletionStates({
                          completedGoalIds: entry.completedGoalIds,
                          completions: affectedGoalCompletions,
                        }),
                        activityIds: applyActivitySelectionStates({
                          activityIds: entry.activityIds,
                          selections: affectedActivitySelections,
                        }),
                      }
                    : entry,
                ),
              }
            : current,
        );
        setConnectionState("online");
        setMessage(null);
      }
    } catch (error) {
      if (
        selectedDateRef.current === logicalDate &&
        selectedDateEpochRef.current === dateEpoch
      ) {
        setDraft((current) => {
          const next = {
            ...current,
            completedGoalIds: restoreGoalCompletionStates({
              completedGoalIds: current.completedGoalIds,
              previousStates: previousGoalStates,
            }),
            activityIds: linkedActivityId && previousActivitySelected !== undefined
              ? applyActivitySelectionStates({
                  activityIds: current.activityIds,
                  selections: [{ activityId: linkedActivityId, selected: previousActivitySelected }],
                })
              : current.activityIds,
          };
          draftRef.current = next;
          return next;
        });
        setMessage({
          kind: "error",
          text: `${(error as Error).message} The goal was restored.`,
        });
        setConnectionState(navigator.onLine ? "error" : "offline");
      }
    } finally {
      for (const goalKey of affectedGoalKeys) {
        pendingGoalRef.current.delete(goalKey);
        setGoalPending(goalKey, false);
      }
      if (activityKey) {
        pendingSelectionRef.current.delete(activityKey);
        setSelectionPending(activityKey, false);
      }
    }
  }

  async function saveGoalConfig() {
    const goalId = selectedGoalId;
    const config = goalConfigDraft;
    const currentGoal = data?.goals.find((goal) => goal.id === goalId);
    if (!goalId || !config || !currentGoal || isSavingGoalConfig || pendingGoalConfigRef.current) return;
    const name = config.name.trim();
    if (!name) {
      setMessage({ kind: "error", text: "Goal name is required." });
      return;
    }
    if (config.repeatType === "daily" && (config.weekdaysMask < 1 || config.weekdaysMask > ALL_WEEKDAYS_MASK)) {
      setMessage({ kind: "error", text: "Choose at least one weekday for a daily goal." });
      return;
    }
    if (config.repeatType === "weekly" && (config.targetPerWeek < 1 || config.targetPerWeek > 7)) {
      setMessage({ kind: "error", text: "Choose between 1 and 7 days per week." });
      return;
    }
    if (!navigator.onLine) {
      setMessage({ kind: "error", text: "You’re offline. Reconnect before updating a goal." });
      setConnectionState("offline");
      return;
    }
    const scheduleType: Goal["scheduleType"] = config.repeatType === "weekly" ? "times_per_week" : config.weekdaysMask === ALL_WEEKDAYS_MASK ? "daily" : "weekdays";
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
    const sequence = goalConfigSaveSequenceRef.current + 1;
    goalConfigSaveSequenceRef.current = sequence;
    activeGoalConfigSaveRef.current = { sequence, goalId };
    const isCurrentSave = () => activeGoalConfigSaveRef.current?.sequence === sequence;
    const isCurrentGoal = () => isCurrentSave() && selectedGoalIdRef.current === goalId;
    pendingGoalConfigRef.current = true;
    setIsSavingGoalConfig(true);
    setMessage(null);
    setData((current) => current ? { ...current, goals: current.goals.map((goal) => goal.id === goalId ? optimisticGoal : goal) } : current);
    try {
      const response = await fetch(`/api/catalog/goal/${goalId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const result = (await response.json()) as { goal?: Goal; error?: string };
      if (!response.ok || !result.goal) throw new Error(result.error ?? "Could not update the goal.");
      if (isCurrentSave()) {
        setData((current) => current ? { ...current, goals: current.goals.map((goal) => goal.id === goalId ? result.goal! : goal) } : current);
        if (isCurrentGoal()) {
          setGoalConfigDraft(goalConfigFromGoal(result.goal));
          setGoalHistory(null);
          setGoalHistoryRevision((revision) => revision + 1);
          setConnectionState("online");
          setMessage({ kind: "success", text: "Goal updated." });
        }
      }
    } catch (error) {
      if (isCurrentSave()) {
        setData((current) => current ? { ...current, goals: current.goals.map((goal) => goal.id === goalId ? previousGoal : goal) } : current);
        if (isCurrentGoal()) {
          setGoalConfigDraft(config);
          setConnectionState(navigator.onLine ? "error" : "offline");
          setMessage({ kind: "error", text: `${(error as Error).message} The goal was restored.` });
        }
      }
    } finally {
      if (isCurrentSave()) {
        activeGoalConfigSaveRef.current = null;
        pendingGoalConfigRef.current = false;
        setIsSavingGoalConfig(false);
      }
    }
  }

  async function saveEntry() {
    if (isSaving || isDeleting) return;
    if (hasPendingGoalToggle(selectedDate) || hasPendingSelectionToggle(selectedDate)) {
      setMessage({
        kind: "info",
        text: "Wait for the mood, activity, or goal update to finish before saving the entry.",
      });
      return;
    }
    if (!draft.moodId) {
      setMessage({
        kind: "error",
        text: "Pick the mood that best sums up the day.",
      });
      return;
    }
    if (!navigator.onLine) {
      setMessage({
        kind: "error",
        text: "You’re offline. Your draft is safe on this device; reconnect to save it.",
      });
      setConnectionState("offline");
      return;
    }
    setIsSaving(true);
    setConnectionState("checking");
    setMessage(null);
    try {
      const response = await fetch(`/api/entries/${selectedDate}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const result = (await response.json()) as {
        entry?: Entry;
        error?: string;
      };
      if (!response.ok || !result.entry)
        throw new Error(result.error ?? "Could not save the entry.");
      setData((current) =>
        current
          ? {
              ...current,
              entries: [
                result.entry!,
                ...current.entries.filter(
                  (entry) => entry.logicalDate !== selectedDate,
                ),
              ],
            }
          : current,
      );
      setDraft(draftFromEntry(result.entry));
      clearStoredDraft(selectedDate);
      markLocalDraft(false);
      setConnectionState("online");
      setMessage({
        kind: "success",
        text: `Saved ${shortDate(selectedDate)}.`,
      });
    } catch (error) {
      setConnectionState(navigator.onLine ? "error" : "offline");
      setMessage({
        kind: "error",
        text: `${(error as Error).message} Your draft is still stored on this device.`,
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteSelectedEntry() {
    if (isDeleting || isSaving || !draft.version)
      return;
    if (hasPendingGoalToggle(selectedDate) || hasPendingSelectionToggle(selectedDate)) {
      setMessage({
        kind: "info",
        text: "Wait for the mood, activity, or goal update to finish before deleting the entry.",
      });
      return;
    }
    if (!window.confirm(`Delete the entry for ${friendlyDate(selectedDate)}?`))
      return;
    if (!navigator.onLine) {
      setMessage({
        kind: "error",
        text: "You’re offline. Reconnect before deleting an entry.",
      });
      setConnectionState("offline");
      return;
    }
    setIsDeleting(true);
    setConnectionState("checking");
    setMessage(null);
    try {
      const response = await fetch(
        `/api/entries/${selectedDate}?expectedVersion=${draft.version}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Could not delete that entry.");
      setData((current) =>
        current
          ? {
              ...current,
              entries: current.entries.filter(
                (entry) => entry.logicalDate !== selectedDate,
              ),
            }
          : current,
      );
      setDraft({
        ...EMPTY_DRAFT,
        completedGoalIds: [...draft.completedGoalIds],
      });
      clearStoredDraft(selectedDate);
      markLocalDraft(false);
      setConnectionState("online");
      setMessage({ kind: "success", text: "Entry deleted." });
    } catch (error) {
      setConnectionState(navigator.onLine ? "error" : "offline");
      setMessage({ kind: "error", text: (error as Error).message });
    } finally {
      setIsDeleting(false);
    }
  }

  if (!data)
    return (
      <main className="app-loading">
        <span className="brand-mark" aria-hidden="true" />
        <p>Opening your journal…</p>
      </main>
    );

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="brand"
          onClick={() => changeView("log")}
          aria-label="Go to log"
          disabled={isSavingGoalConfig || isActivityCreateBusy || (isSetupBusy && view === "settings")}
        >
          <span className="brand-mark" aria-hidden="true" />
          <span>daymark</span>
        </button>
        <div className="topbar-date">
          {view === "log"
            ? friendlyDate(selectedDate)
            : view === "calendar"
              ? "Your calendar"
              : view === "goal"
                ? "Goal history"
                : view === "add-activity"
                  ? "Add activity"
                  : "Your setup"}
        </div>
        <div className={`connection-pill ${connectionState}`} role="status">
          <Icon
            name={
              connectionState === "offline"
                ? "cloud_off"
                : connectionState === "error"
                  ? "cloud_alert"
                  : UI_ICONS.sync
            }
          />
          {connectionState === "checking"
            ? " checking"
            : connectionState === "online"
              ? " online"
              : connectionState === "offline"
                ? " offline"
                : " sync issue"}
        </div>
      </header>

      <main className="content-shell">
        {message && view !== "log" && (
          <div className={`notice ${message.kind}`} role="status">
            {message.kind === "success"
              ? "✓"
              : message.kind === "info"
                ? "↻"
                : "!"}{" "}
            {message.text}
          </div>
        )}
        {view === "log" && (
          <LogView
            data={data}
            selectedDate={selectedDate}
            draft={draft}
            hasLocalDraft={hasLocalDraft}
            activityQuery={activityQuery}
            isLoadingDate={isLoadingDate}
            onDate={chooseDate}
            onMood={toggleMood}
            onActivityQuery={setActivityQuery}
            onToggleActivity={toggleActivity}
            onToggleGoal={toggleGoal}
            onOpenGoal={openGoal}
            onOpenAddActivity={(groupId) => changeView("add-activity", { groupId, returnView: "log" })}
            onSave={saveEntry}
            onDelete={deleteSelectedEntry}
            isSaving={isSaving}
            isDeleting={isDeleting}
            pendingGoalKeys={pendingGoalKeys}
            pendingSelectionKeys={pendingSelectionKeys}
            message={message}
          />
        )}
        {view === "calendar" && (
          <CalendarView
            month={calendarMonth}
            days={calendarDays}
            moods={data.moods}
            today={data.today}
            isLoading={isLoadingCalendar}
            onMonth={setCalendarMonth}
            onOpenDate={(date) => {
              changeView("log");
              void chooseDate(date);
            }}
          />
        )}
        {view === "goal" && selectedGoalId && goalConfigDraft && (
          <GoalDetailView
            goal={data.goals.find((candidate) => candidate.id === selectedGoalId) ?? null}
            activities={data.activities}
            history={goalHistory}
            month={goalHistoryMonth}
            config={goalConfigDraft}
            isLoadingHistory={isLoadingGoalHistory}
            isSavingConfig={isSavingGoalConfig}
            iconPickerOpen={goalIconPickerOpen}
            onBack={closeGoal}
            onMonth={setGoalHistoryMonth}
            onConfig={(next) => setGoalConfigDraft(next)}
            onSaveConfig={() => void saveGoalConfig()}
            onOpenIconPicker={() => setGoalIconPickerOpen(true)}
            onCloseIconPicker={() => setGoalIconPickerOpen(false)}
          />
        )}
        {view === "add-activity" && (
          <AddActivityView
            data={data}
            initialGroupId={activityGroupId}
            sourceView={activityReturnView}
            onBack={(notice) => closeAddActivity(notice)}
            onRefresh={loadBootstrap}
            onMessage={setMessage}
            onBusyChange={setActivityCreateBusy}
          />
        )}
        {view === "settings" && (
          <SetupView
            data={data}
            onRefresh={loadBootstrap}
            onMessage={setMessage}
            onBusyChange={setIsSetupBusy}
            onOpenGoal={openGoal}
            onOpenAddActivity={(groupId) => changeView("add-activity", { groupId, returnView: "settings" })}
          />
        )}
      </main>

      <nav
        className="bottom-nav"
        aria-label="Primary navigation"
        aria-busy={isSavingGoalConfig || isActivityCreateBusy || (isSetupBusy && view === "settings")}
      >
        <button
          className={view === "log" ? "active" : ""}
          onClick={() => changeView("log")}
          disabled={isSavingGoalConfig || isActivityCreateBusy || (isSetupBusy && view === "settings")}
        >
          <span className="nav-icon">
            <Icon name={UI_ICONS.log} />
          </span>
          <span>Log</span>
        </button>
        <button
          className={view === "calendar" ? "active" : ""}
          onClick={() => changeView("calendar")}
          disabled={isSavingGoalConfig || isActivityCreateBusy || (isSetupBusy && view === "settings")}
        >
          <span className="nav-icon">
            <Icon name={UI_ICONS.calendar} />
          </span>
          <span>Calendar</span>
        </button>
        <button
          className={view === "settings" ? "active" : ""}
          onClick={() => changeView("settings")}
          disabled={isSavingGoalConfig || isActivityCreateBusy || (isSetupBusy && view === "settings")}
        >
          <span className="nav-icon">
            <Icon name={UI_ICONS.settings} />
          </span>
          <span>Setup</span>
        </button>
      </nav>
    </div>
  );
}

function LogView({
  data,
  selectedDate,
  draft,
  hasLocalDraft,
  activityQuery,
  isLoadingDate,
  onDate,
  onMood,
  onActivityQuery,
  onToggleActivity,
  onToggleGoal,
  onOpenGoal,
  onOpenAddActivity,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
  pendingGoalKeys,
  pendingSelectionKeys,
  message,
}: {
  data: Bootstrap;
  selectedDate: string;
  draft: Draft;
  hasLocalDraft: boolean;
  activityQuery: string;
  isLoadingDate: boolean;
  onDate: (date: string) => void;
  onMood: (id: string) => void;
  onActivityQuery: (value: string) => void;
  onToggleActivity: (id: string) => void;
  onToggleGoal: (id: string) => void;
  onOpenGoal: (id: string) => void;
  onOpenAddActivity: (groupId: string) => void;
  onSave: () => void;
  onDelete: () => void;
  isSaving: boolean;
  isDeleting: boolean;
  pendingGoalKeys: Set<string>;
  pendingSelectionKeys: Set<string>;
  message: Notice | null;
}) {
  const existing = getEntryForDate(data.entries, selectedDate);
  const groups = useMemo(() => {
    return filterActivityGroups({
      groups: data.groups,
      activities: data.activities,
      query: activityQuery,
    });
  }, [activityQuery, data.activities, data.groups]);
  const formBusy = isSaving || isDeleting;
  const goalsBusy = [...pendingGoalKeys].some((key) =>
    key.startsWith(`${selectedDate}:`),
  );
  const selectionBusy = [...pendingSelectionKeys].some((key) =>
    key.startsWith(`${selectedDate}:`),
  );

  return (
    <>
      <fieldset className="log-form" disabled={formBusy} aria-busy={formBusy}>
        <legend className="sr-only">Daily entry form</legend>
        {formBusy && <p className="sr-only" role="status">Daily entry form disabled while {isDeleting ? "deleting" : "saving"}.</p>}
        {selectionBusy && (
          <p className="sr-only" role="status">
            Saving your mood or activity selection…
          </p>
        )}
        <section className="hero-card">
          <div>
            <p className="eyebrow">One small check-in</p>
            <h1>How did your day feel?</h1>
            <p className="muted">
              Capture the shape of the day while it is still close.
            </p>
          </div>
          <div className="date-switcher" aria-label="Choose the logical day">
            <button
              className={selectedDate === data.today ? "selected" : ""}
              onClick={() => onDate(data.today)}
              disabled={isLoadingDate || goalsBusy || selectionBusy}
            >
              Today
            </button>
            <button
              className={selectedDate === data.yesterday ? "selected" : ""}
              onClick={() => onDate(data.yesterday)}
              disabled={isLoadingDate || goalsBusy || selectionBusy}
            >
              Yesterday
            </button>
            <label className="date-input">
              <span>Other</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => onDate(event.target.value)}
                disabled={isLoadingDate || goalsBusy || selectionBusy}
              />
            </label>
          </div>
        </section>

        {message && (
          <div className={`notice ${message.kind}`} role="status">
            {message.kind === "success"
              ? "✓"
              : message.kind === "info"
                ? "↻"
                : "!"}{" "}
            {message.text}
          </div>
        )}

        <section className="panel goals-panel" aria-busy={isLoadingDate || goalsBusy}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Goals</p>
              <h2>Keep the promises that matter</h2>
            </div>
          </div>
          <div className="goal-list">
            {data.goals
              .filter((goal) => !goal.archived)
              .map((goal) => (
                <GoalRow
                  key={goal.id}
                  goal={goal}
                  activity={activityFor(data.activities, goal.activityId)}
                  checked={draft.completedGoalIds.includes(goal.id)}
                  pending={pendingGoalKeys.has(`${selectedDate}:${goal.id}`)}
                  disabled={isLoadingDate || goalsBusy}
                  onToggle={() => {
                    void onToggleGoal(goal.id);
                  }}
                  onOpen={() => onOpenGoal(goal.id)}
                />
              ))}
          </div>
        </section>

        <section className="panel mood-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Overall mood</p>
              <h2>Pick one</h2>
            </div>
            <span className="required-label">required</span>
          </div>
          <div className="mood-grid" aria-busy={isLoadingDate || selectionBusy}>
            {data.moods.map((mood) => (
              <button
                key={mood.id}
                className={`mood-option ${draft.moodId === mood.id ? "selected" : ""}`}
                style={{ "--mood-color": mood.color } as React.CSSProperties}
                aria-pressed={draft.moodId === mood.id}
                aria-busy={pendingSelectionKeys.has(`${selectedDate}:mood:`)}
                disabled={isLoadingDate || pendingSelectionKeys.has(`${selectedDate}:mood:`)}
                onClick={() => onMood(mood.id)}
              >
                <span className="mood-emoji">{mood.emoji}</span>
                <span>{mood.name}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel activities-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Activities</p>
              <h2>What shaped the day?</h2>
            </div>
            <span className="selection-count">
              {draft.activityIds.length} selected
            </span>
          </div>
          {draft.activityIds.length > 0 && (
            <div className="selection-row">
              {draft.activityIds.map((id) => {
                const activity = activityFor(data.activities, id);
                return activity ? (
                  <button
                    key={id}
                    className="selection-chip"
                    disabled={isLoadingDate || pendingSelectionKeys.has(`${selectedDate}:activity:${id}`)}
                    aria-busy={pendingSelectionKeys.has(`${selectedDate}:activity:${id}`)}
                    onClick={() => onToggleActivity(id)}
                  >
                    <Icon name={activity.icon} /> {activity.name}{" "}
                    <span>
                      <Icon name={UI_ICONS.close} />
                    </span>
                  </button>
                ) : null;
              })}
            </div>
          )}
          <label className="search-field">
            <Icon name={UI_ICONS.search} />
            <input
              value={activityQuery}
              onChange={(event) => onActivityQuery(event.target.value)}
              placeholder="Search your activities"
              aria-label="Search activities"
            />
          </label>
          {isLoadingDate ? (
            <div className="inline-loading">Loading that day…</div>
          ) : (
            <ActivityGroupList
              groups={groups}
              activityQuery={activityQuery}
              selectedActivityIds={draft.activityIds}
              selectedDate={selectedDate}
              isLoadingDate={isLoadingDate}
              pendingSelectionKeys={pendingSelectionKeys}
              onToggleActivity={onToggleActivity}
              onOpenAddActivity={onOpenAddActivity}
            />
          )}
        </section>
      </fieldset>

      <div className="save-bar" aria-busy={formBusy || goalsBusy || selectionBusy}>
        <div>
          <strong>{existing ? "Edit this entry" : "Ready to save?"}</strong>
          <span>
            {friendlyDate(selectedDate)} · {draft.activityIds.length} activities
          </span>
          {hasLocalDraft && (
            <small className="draft-status">
              <Icon name="save" /> Unsaved changes stored on this device
            </small>
          )}
        </div>
        <div className="save-actions">
          {existing && (
            <button
              className="ghost-button danger"
              onClick={onDelete}
              disabled={isDeleting || isSaving || goalsBusy || selectionBusy}
              aria-busy={isDeleting}
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </button>
          )}
          <button
            className="primary-button"
            onClick={onSave}
            disabled={isSaving || isDeleting || goalsBusy || selectionBusy}
            aria-busy={isSaving}
          >
            {isSaving
              ? "Saving…"
              : goalsBusy || selectionBusy
                ? "Updating selection…"
                : existing
                  ? "Update entry"
                  : "Save entry"}
          </button>
        </div>
      </div>
    </>
  );
}

function AddActivityView({
  data,
  initialGroupId,
  sourceView,
  onBack,
  onRefresh,
  onMessage,
  onBusyChange,
}: {
  data: Bootstrap;
  initialGroupId?: string;
  sourceView: ActivityCreationSource;
  onBack: (notice?: Notice) => void;
  onRefresh: () => Promise<Bootstrap>;
  onMessage: (message: Notice) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const activeGroups = useMemo(() => data.groups.filter((group) => !group.archived), [data.groups]);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("category");
  const [groupId, setGroupId] = useState(() => resolveActiveActivityGroupId({ groups: data.groups, requestedId: initialGroupId }));
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const selectedGroupId = resolveActiveActivityGroupId({ groups: data.groups, requestedId: groupId || initialGroupId });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;
    const activityName = name.trim();
    const activeGroupId = selectedGroupId;
    if (!activityName) {
      onMessage({ kind: "error", text: "Activity name is required." });
      return;
    }
    if (!activeGroupId) {
      onMessage({ kind: "error", text: "Create an active activity group before adding an activity." });
      return;
    }
    if (!navigator.onLine) {
      onMessage({ kind: "error", text: "You’re offline. Reconnect before adding an activity." });
      return;
    }
    setIsSaving(true);
    onBusyChange(true);
    onMessage({ kind: "info", text: "Adding activity…" });
    try {
      const response = await fetch("/api/catalog", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "activity", name: activityName, groupId: activeGroupId, icon }),
      });
      const result = (await response.json()) as { activity?: Activity; error?: string };
      if (!response.ok || !result.activity) throw new Error(result.error ?? "Could not add activity.");
      try {
        await onRefresh();
      } catch (error) {
        onMessage({ kind: "error", text: `Created, but refresh failed; refresh the page before retrying. ${(error as Error).message}` });
        return;
      }
      onBack({ kind: "success", text: "Activity added." });
    } catch (error) {
      onMessage({ kind: "error", text: (error as Error).message });
    } finally {
      onBusyChange(false);
      setIsSaving(false);
    }
  }

  return (
    <section className="page-section activity-create-page">
      <div className="page-intro activity-create-intro">
        <button className="back-button" onClick={() => onBack()} disabled={isSaving}>
          <Icon name="arrow_back" /> {sourceView === "settings" ? "Setup" : "Log"}
        </button>
        <div className="activity-create-title">
          <span className="goal-detail-icon"><Icon name={icon} /></span>
          <div>
            <p className="eyebrow">Activities</p>
            <h1>Add new activity</h1>
            <p className="muted">Add something you want to include in your daily check-in.</p>
          </div>
        </div>
      </div>

      <form className="settings-card goal-config-card activity-create-card" onSubmit={(event) => void submit(event)} aria-busy={isSaving}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">New activity</p>
            <h2>What should we call it?</h2>
          </div>
        </div>
        <label className="goal-config-field">
          <span>Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Activity name" autoFocus disabled={isSaving} required />
        </label>
        <label className="goal-config-field">
          <span>Activity group</span>
          <select aria-label="Activity group" value={selectedGroupId} onChange={(event) => setGroupId(event.target.value)} disabled={isSaving || activeGroups.length === 0}>
            {activeGroups.length === 0 && <option value="">No active groups available</option>}
            {activeGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
        </label>
        <div className="goal-icon-setting">
          <span>Icon</span>
          <button type="button" className="goal-icon-button" onClick={() => setIconPickerOpen(true)} disabled={isSaving} aria-label="Choose activity icon">
            <Icon name={icon} />
            <span>Change icon</span>
          </button>
        </div>
        <div className="goal-config-actions activity-create-actions">
          <button type="submit" className="primary-button" disabled={isSaving || activeGroups.length === 0} aria-busy={isSaving}>
            {isSaving ? "Adding…" : "Add activity"}
          </button>
          <button type="button" className="secondary-button" onClick={() => onBack()} disabled={isSaving}>Cancel</button>
        </div>
      </form>

      {iconPickerOpen && (
        <IconPicker
          activityName={name || "your new activity"}
          currentIcon={icon}
          isSaving={isSaving}
          onClose={() => setIconPickerOpen(false)}
          onSelect={(nextIcon) => {
            setIcon(nextIcon);
            setIconPickerOpen(false);
          }}
        />
      )}
    </section>
  );
}

type ActivityGroupListProps = {
  groups: Array<{ group: ActivityGroup; activities: Activity[] }>;
  activityQuery: string;
  selectedActivityIds: string[];
  selectedDate: string;
  isLoadingDate: boolean;
  pendingSelectionKeys: Set<string>;
  onToggleActivity: (id: string) => void;
  onOpenAddActivity: (groupId: string) => void;
};

function ActivityGroupList({
  groups,
  activityQuery,
  selectedActivityIds,
  selectedDate,
  isLoadingDate,
  pendingSelectionKeys,
  onToggleActivity,
  onOpenAddActivity,
}: ActivityGroupListProps) {
  const hasQuery = activityQuery.trim().length > 0;

  if (groups.length === 0)
    return <p className="empty-inline">No activities match that search.</p>;

  return (
    <div className="activity-groups">
      {groups.map(({ group, activities }) => {
        const summary = summarizeActivityGroup({
          activityIds: activities.map((activity) => activity.id),
          selectedActivityIds,
        });
        const activityLabel =
          summary.activityCount === 1 ? "activity" : "activities";

        return (
          <details key={group.id} open={hasQuery || undefined}>
            <summary>
              <span>{group.name}</span>
              <span className="group-summary-meta">
                <span>
                  {summary.activityCount} {activityLabel} ·{" "}
                  {summary.selectedCount} selected
                </span>
                <button
                  type="button"
                  className="add-activity-button"
                  aria-label={`Add new activity to ${group.name}`}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onOpenAddActivity(group.id);
                  }}
                >
                  + Add new
                </button>
                <Icon name="expand_more" className="group-expand-icon" />
              </span>
            </summary>
            <div className="activity-grid">
              {activities.map((activity) => {
                const selected = selectedActivityIds.includes(activity.id);

                return (
                  <button
                    key={activity.id}
                    className={`activity-button ${selected ? "selected" : ""}`}
                    aria-pressed={selected}
                    aria-busy={pendingSelectionKeys.has(`${selectedDate}:activity:${activity.id}`)}
                    disabled={isLoadingDate || pendingSelectionKeys.has(`${selectedDate}:activity:${activity.id}`)}
                    onClick={() => onToggleActivity(activity.id)}
                  >
                    <span className="activity-icon">
                      <Icon name={activity.icon} />
                    </span>
                    <span>{activity.name}</span>
                    {selected && (
                      <span className="check-mark">
                        <Icon name={UI_ICONS.check} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </details>
        );
      })}
    </div>
  );
}

function GoalRow({
  goal,
  activity,
  checked,
  pending,
  disabled,
  onToggle,
  onOpen,
}: {
  goal: Goal;
  activity?: Activity;
  checked: boolean;
  pending: boolean;
  disabled: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const detail = goalRepeatType(goal) === "weekly"
    ? `${goal.targetPerWeek ?? 1} ${goal.targetPerWeek === 7 ? "days" : goal.targetPerWeek === 1 ? "day" : "days"} this week`
    : goalWeekdayMask(goal) === ALL_WEEKDAYS_MASK
      ? "Every day"
      : "Selected weekdays";
  const unavailable = pending || disabled;
  return (
    <div className={`goal-row ${checked ? "checked" : ""}`} aria-busy={pending} aria-disabled={unavailable}>
      <button
        className="goal-checkbox"
        onClick={onToggle}
        disabled={unavailable}
        aria-label={`${checked ? "Mark" : "Mark"} ${goal.name} ${checked ? "not completed" : "completed"}`}
        aria-pressed={checked}
        aria-busy={pending}
      >
        {checked && <Icon name={UI_ICONS.check} />}
      </button>
      <button className="goal-main" onClick={onOpen} disabled={unavailable} aria-label={`Open ${goal.name} goal`}>
        <span className="goal-copy">
          <strong><Icon name={goal.materialIcon} /> {goal.name}</strong>
          <small>
            {pending
              ? "Saving…"
              : disabled
                ? "Loading day…"
                : `${detail}${activity ? ` · ${activity.name}` : ""}`}
          </small>
        </span>
        <span className="goal-arrow"><Icon name="chevron_right" /></span>
      </button>
      {pending && <span className="sr-only" role="status">Saving {goal.name}…</span>}
    </div>
  );
}

function GoalDetailView({
  goal,
  activities,
  history,
  month,
  config,
  isLoadingHistory,
  isSavingConfig,
  iconPickerOpen,
  onBack,
  onMonth,
  onConfig,
  onSaveConfig,
  onOpenIconPicker,
  onCloseIconPicker,
}: {
  goal: Goal | null;
  activities: Activity[];
  history: GoalHistory | null;
  month: string;
  config: GoalConfigDraft;
  isLoadingHistory: boolean;
  isSavingConfig: boolean;
  iconPickerOpen: boolean;
  onBack: () => void;
  onMonth: (month: string) => void;
  onConfig: (config: GoalConfigDraft) => void;
  onSaveConfig: () => void;
  onOpenIconPicker: () => void;
  onCloseIconPicker: () => void;
}) {
  if (!goal) {
    return (
      <section className="page-section">
        <button className="ghost-button" onClick={onBack} disabled={isSavingConfig}>Back to goals</button>
        <p className="empty-inline">That goal is no longer available.</p>
      </section>
    );
  }
  const resolvedMonth = /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7);
  const [year, monthNumber] = resolvedMonth.split("-").map(Number);
  const firstDay = new Date(year, monthNumber - 1, 1).getDay();
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const historyDays = new Map((history?.days ?? []).map((day) => [day.logicalDate, day]));
  const cells = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => `${resolvedMonth}-${String(index + 1).padStart(2, "0")}`),
  ];
  const label = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(new Date(year, monthNumber - 1, 1));
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const linkedActivity = activities.find((activity) => activity.id === config.activityId);
  const activityOptions = activities.filter((activity) => !activity.archived || activity.id === config.activityId);
  const isDirty = config.name !== goal.name || config.activityId !== goal.activityId || config.materialIcon !== goal.materialIcon || config.repeatType !== goalRepeatType(goal) || config.weekdaysMask !== goalWeekdayMask(goal) || config.targetPerWeek !== Math.min(7, Math.max(1, goal.targetPerWeek ?? 1));

  function shiftMonth(amount: number) {
    const next = new Date(year, monthNumber - 1 + amount, 1);
    onMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
  }

  function toggleWeekday(index: number) {
    const nextMask = config.weekdaysMask ^ (1 << index);
    onConfig({ ...config, weekdaysMask: nextMask });
  }

  function statusLabel(status: GoalHistory["weeks"][number]["status"]) {
    return status === "accomplished" ? "Accomplished" : status === "not_accomplished" ? "Not accomplished" : status === "in_progress" ? "In progress" : "Upcoming";
  }

  return (
    <section className="page-section goal-detail-page">
      <div className="page-intro goal-detail-intro">
        <button className="back-button" onClick={onBack} disabled={isSavingConfig}><Icon name="arrow_back" /> Goals</button>
        <div className="goal-detail-title">
          <span className="goal-detail-icon"><Icon name={goal.materialIcon} /></span>
          <div>
            <p className="eyebrow">Goal history</p>
            <h1>{goal.name}</h1>
            <p className="muted">Completed days and weekly progress for this goal.</p>
          </div>
        </div>
      </div>

      <section className="settings-card goal-config-card" aria-busy={isSavingConfig}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Goal settings</p>
            <h2>Repeat, activity, and icon</h2>
            <p className="muted small-copy">Choose when this goal is expected, and optionally link it to an activity.</p>
          </div>
        </div>
        <label className="goal-config-field">
          <span>Name</span>
          <input value={config.name} onChange={(event) => onConfig({ ...config, name: event.target.value })} disabled={isSavingConfig} />
        </label>
        <div className="goal-config-row">
          <label className="goal-config-field">
            <span>Repeat</span>
            <select aria-label="Repeat" value={config.repeatType} onChange={(event) => onConfig({ ...config, repeatType: event.target.value as GoalRepeatType })} disabled={isSavingConfig}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>
          <div className="goal-icon-setting">
            <span>Icon</span>
            <button className="goal-icon-button" onClick={onOpenIconPicker} disabled={isSavingConfig} aria-label="Choose goal icon">
              <Icon name={config.materialIcon} />
              <span>Change icon</span>
            </button>
          </div>
        </div>
        <label className="goal-config-field">
          <span>Associated activity</span>
          <select aria-label="Associated activity" value={config.activityId ?? ""} onChange={(event) => onConfig({ ...config, activityId: event.target.value || null })} disabled={isSavingConfig}>
            <option value="">No associated activity</option>
            {activityOptions.map((activity) => <option key={activity.id} value={activity.id}>{activity.name}{activity.archived ? " (archived)" : ""}</option>)}
          </select>
          {linkedActivity?.archived && <small className="muted">This activity is archived but remains linked.</small>}
        </label>

        {config.repeatType === "daily" ? (
          <fieldset className="weekday-picker" disabled={isSavingConfig}>
            <legend>Days expected</legend>
            <div className="weekday-options">
              {weekdays.map((weekday, index) => (
                <label className={`weekday-option ${config.weekdaysMask & (1 << index) ? "selected" : ""}`} key={weekday}>
                  <input type="checkbox" checked={Boolean(config.weekdaysMask & (1 << index))} onChange={() => toggleWeekday(index)} />
                  <span>{weekday}</span>
                </label>
              ))}
            </div>
            <small className="muted">Select at least one day.</small>
          </fieldset>
        ) : (
          <fieldset className="weekly-target-picker" disabled={isSavingConfig}>
            <legend>Days per week</legend>
            <div className="weekly-target-options">
              {Array.from({ length: 7 }, (_, index) => index + 1).map((count) => (
                <label className={`weekly-target-option ${config.targetPerWeek === count ? "selected" : ""}`} key={count}>
                  <input type="radio" name="goal-target-per-week" value={count} checked={config.targetPerWeek === count} onChange={() => onConfig({ ...config, targetPerWeek: count })} />
                  <span>{count === 7 ? "Every day" : `${count} ${count === 1 ? "day" : "days"} per week`}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="goal-config-actions">
          <button className="primary-button" onClick={onSaveConfig} disabled={isSavingConfig || !isDirty} aria-busy={isSavingConfig}>{isSavingConfig ? "Saving…" : "Save goal"}</button>
          {isDirty && !isSavingConfig && <span className="muted small-copy">Unsaved goal changes</span>}
        </div>
      </section>

      <section className="calendar-card goal-history-card" aria-busy={isLoadingHistory}>
        <div className="calendar-heading">
          <button className={`icon-button ${isLoadingHistory ? "pending-action" : ""}`} aria-label="Previous month" aria-busy={isLoadingHistory} disabled={isLoadingHistory} onClick={() => shiftMonth(-1)}><Icon name={isLoadingHistory ? UI_ICONS.sync : "chevron_left"} /></button>
          <h2>{label}</h2>
          <button className={`icon-button ${isLoadingHistory ? "pending-action" : ""}`} aria-label="Next month" aria-busy={isLoadingHistory} disabled={isLoadingHistory} onClick={() => shiftMonth(1)}><Icon name={isLoadingHistory ? UI_ICONS.sync : "chevron_right"} /></button>
        </div>
        <p className="muted goal-history-explainer">{goalRepeatType(goal) === "daily" ? "Green days are completed; pale days are not completed. A dash marks an expected day." : `Green days are completed. Each week needs ${goal.targetPerWeek ?? 1} completed ${(goal.targetPerWeek ?? 1) === 1 ? "day" : "days"}.`}</p>
        <div className="calendar-weekdays">{weekdays.map((weekday) => <span key={weekday}>{weekday}</span>)}</div>
        <div className="calendar-grid goal-calendar-grid">
          {cells.map((date, index) => {
            if (!date) return <span className="calendar-blank" key={`blank-${index}`} />;
            const day = historyDays.get(date);
            const state = day?.completed ? "completed" : "not-completed";
            const scheduleLabel = day?.scheduled ? ", expected" : "";
            return <div className={`calendar-day goal-day ${state}`} key={date} aria-label={`${date}: ${state.replaceAll("-", " ")}${scheduleLabel}`}><span>{Number(date.slice(-2))}</span>{day?.scheduled && <Icon name={day.completed ? UI_ICONS.check : "remove"} />}</div>;
          })}
        </div>
        {isLoadingHistory && <p className="calendar-loading" role="status">Checking this month…</p>}
        <div className="calendar-legend goal-calendar-legend">
          <span><i className="legend-dot goal-completed" /> Completed</span>
          <span><i className="legend-dot goal-not-completed" /> Not completed</span>
        </div>
      </section>

      <section className="goal-week-history" aria-live="polite">
        <div className="section-heading"><div><p className="eyebrow">Weekly result</p><h2>Was the goal accomplished?</h2></div></div>
        {!history && isLoadingHistory ? <p className="inline-loading">Loading weekly results…</p> : history?.weeks.map((week) => (
          <div className={`goal-week-row ${week.status}`} key={week.weekStart}>
            <span className={`goal-week-status ${week.status}`} aria-label={statusLabel(week.status)}><Icon name={week.status === "accomplished" ? UI_ICONS.check : week.status === "not_accomplished" ? "close" : week.status === "upcoming" ? "event" : "hourglass_top"} /></span>
            <span className="goal-week-copy"><strong>{shortDate(week.weekStart)} – {shortDate(week.weekEnd)}</strong><small>{statusLabel(week.status)} · {week.completedCount}/{week.expectedCount} {week.repeatType === "daily" ? "scheduled days" : "days"}</small></span>
          </div>
        ))}
      </section>

      {iconPickerOpen && <IconPicker activityName={config.name || goal.name} itemType="Goal" currentIcon={config.materialIcon} isSaving={isSavingConfig} onClose={onCloseIconPicker} onSelect={(icon) => { onConfig({ ...config, materialIcon: icon }); onCloseIconPicker(); }} />}
    </section>
  );
}

function CalendarView({
  month,
  days,
  moods,
  today,
  isLoading,
  onMonth,
  onOpenDate,
}: {
  month: string;
  days: CalendarEntryDay[];
  moods: Mood[];
  today: string;
  isLoading: boolean;
  onMonth: (month: string) => void;
  onOpenDate: (date: string) => void;
}) {
  const resolvedMonth = /^\d{4}-\d{2}$/.test(month) ? month : today.slice(0, 7);
  const [year, monthNumber] = resolvedMonth.split("-").map(Number);
  const firstDay = new Date(year, monthNumber - 1, 1).getDay();
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const entriesByDate = new Map(days.map((day) => [day.logicalDate, day]));
  const cells = [
    ...Array(firstDay).fill(null),
    ...Array.from(
      { length: daysInMonth },
      (_, index) => `${resolvedMonth}-${String(index + 1).padStart(2, "0")}`,
    ),
  ];
  const label = new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, monthNumber - 1, 1));
  function shiftMonth(amount: number) {
    const next = new Date(year, monthNumber - 1 + amount, 1);
    onMonth(
      `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`,
    );
  }
  return (
    <section className="page-section calendar-page">
      <div className="page-intro">
        <p className="eyebrow">Your history</p>
        <h1>Calendar</h1>
        <p className="muted">
          Each entry day shows its mood. Select any day to open or add its check-in.
        </p>
      </div>
      <section className="calendar-card">
        <div className="calendar-heading">
          <button
            className={`icon-button ${isLoading ? "pending-action" : ""}`}
            aria-label={isLoading ? "Loading month" : "Previous month"}
            aria-busy={isLoading}
            disabled={isLoading}
            onClick={() => shiftMonth(-1)}
          >
            <Icon name={isLoading ? UI_ICONS.sync : "chevron_left"} />
          </button>
          <h2>{label}</h2>
          <button
            className={`icon-button ${isLoading ? "pending-action" : ""}`}
            aria-label={isLoading ? "Loading month" : "Next month"}
            aria-busy={isLoading}
            disabled={isLoading}
            onClick={() => shiftMonth(1)}
          >
            <Icon name={isLoading ? UI_ICONS.sync : "chevron_right"} />
          </button>
        </div>
        <div className="calendar-weekdays">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {cells.map((date, index) => {
            if (!date) return <span className="calendar-blank" key={`blank-${index}`} />;
            const entry = entriesByDate.get(date);
            const mood = entry ? moodFor(moods, entry.moodId) : undefined;
            return (
              <button
                key={date}
                className={`calendar-day ${entry ? "filled" : ""} ${date === today ? "today" : ""}`}
                style={mood ? ({ "--calendar-mood-color": mood.color } as React.CSSProperties) : undefined}
                onClick={() => onOpenDate(date)}
                aria-label={`${friendlyDate(date)}${mood ? `, ${mood.name} mood, entry exists` : entry ? ", entry exists" : ", empty"}`}
              >
                <span>{Number(date.slice(-2))}</span>
                {mood && <span className="calendar-mood-emoji" aria-hidden="true">{mood.emoji}</span>}
              </button>
            );
          })}
        </div>
        {isLoading && (
          <p className="calendar-loading" role="status">
            Checking this month…
          </p>
        )}
        <div className="calendar-legend">
          <span>
            <i className="legend-dot filled" /> Entry with mood
          </span>
          <span>
            <i className="legend-dot" /> Empty
          </span>
        </div>
      </section>
    </section>
  );
}
