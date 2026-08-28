"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type Activity,
  type ActivityGroup,
  type Bootstrap,
  type DaySelections,
  type Entry,
  type Goal,
  type Mood,
  isLogicalDate,
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
import { SetupView } from "./components/setup-view";

type View = "log" | "calendar" | "entries" | "settings";
type ConnectionState = "checking" | "online" | "offline" | "error";
type Notice = { kind: "success" | "error" | "info"; text: string };

const EMPTY_DRAFT: Draft = {
  moodId: "",
  activityIds: [],
  completedGoalIds: [],
  localTime: "23:00",
};

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
  const [hasMoreEntries, setHasMoreEntries] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState("");
  const [calendarDates, setCalendarDates] = useState<string[]>([]);
  const [isLoadingCalendar, setIsLoadingCalendar] = useState(false);
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
  const pendingGoalRef = useRef<Set<string>>(new Set());
  const pendingSelectionRef = useRef<Set<string>>(new Set());
  const failedSelectionRef = useRef<Set<string>>(new Set());
  const hasLocalDraftRef = useRef(false);
  const selectedDateRef = useRef("");
  const selectedDateEpochRef = useRef(0);
  draftRef.current = draft;

  function markLocalDraft(value: boolean) {
    hasLocalDraftRef.current = value;
    setHasLocalDraft(value);
  }

  function changeView(nextView: View) {
    if (isSetupBusy && view === "settings" && nextView !== "settings") return;
    setView(nextView);
    setMessage(null);
  }

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
    setHasMoreEntries(next.entries.length >= 30);
    setDraft(recovered.draft);
    markLocalDraft(recovered.restored);
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
        return fetch(`/api/calendar?month=${calendarMonth}`, {
          cache: "no-store",
        });
      })
      .then(async (response) => {
        if (!response) return null;
        if (!response.ok) throw new Error("Could not load that month.");
        return (await response.json()) as { dates: string[] };
      })
      .then((result) => {
        if (result && !cancelled) {
          setCalendarDates(result.dates);
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

  async function loadOlderEntries() {
    if (!data || isLoadingMore || !hasMoreEntries) return;
    setIsLoadingMore(true);
    try {
      const response = await fetch(
        `/api/entries?limit=30&offset=${data.entries.length}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("Could not load older entries.");
      const result = (await response.json()) as {
        entries: Entry[];
        hasMore: boolean;
      };
      setData((current) =>
        current
          ? {
              ...current,
              entries: [
                ...current.entries,
                ...result.entries.filter(
                  (entry) =>
                    !current.entries.some(
                      (existing) => existing.id === entry.id,
                    ),
                ),
              ],
            }
          : current,
      );
      setHasMoreEntries(result.hasMore);
      setConnectionState("online");
    } catch (error) {
      setConnectionState(navigator.onLine ? "error" : "offline");
      setMessage({ kind: "error", text: (error as Error).message });
    } finally {
      setIsLoadingMore(false);
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
          disabled={isSetupBusy && view === "settings"}
        >
          <span className="brand-mark" aria-hidden="true" />
          <span>daymark</span>
        </button>
        <div className="topbar-date">
          {view === "log"
            ? friendlyDate(selectedDate)
            : view === "calendar"
              ? "Your calendar"
              : view === "entries"
                ? "Your entries"
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
            dates={calendarDates}
            today={data.today}
            isLoading={isLoadingCalendar}
            onMonth={setCalendarMonth}
            onOpenDate={(date) => {
              changeView("log");
              void chooseDate(date);
            }}
          />
        )}
        {view === "entries" && (
          <EntriesView
            data={data}
            onEdit={(date) => {
              changeView("log");
              void chooseDate(date);
            }}
            onLoadMore={loadOlderEntries}
            hasMore={hasMoreEntries}
            isLoadingMore={isLoadingMore}
          />
        )}
        {view === "settings" && (
          <SetupView
            data={data}
            onRefresh={loadBootstrap}
            onMessage={setMessage}
            onBusyChange={setIsSetupBusy}
          />
        )}
      </main>

      <nav
        className="bottom-nav"
        aria-label="Primary navigation"
        aria-busy={isSetupBusy && view === "settings"}
      >
        <button
          className={view === "log" ? "active" : ""}
          onClick={() => changeView("log")}
          disabled={isSetupBusy && view === "settings"}
        >
          <span className="nav-icon">
            <Icon name={UI_ICONS.log} />
          </span>
          <span>Log</span>
        </button>
        <button
          className={view === "calendar" ? "active" : ""}
          onClick={() => changeView("calendar")}
          disabled={isSetupBusy && view === "settings"}
        >
          <span className="nav-icon">
            <Icon name={UI_ICONS.calendar} />
          </span>
          <span>Calendar</span>
        </button>
        <button
          className={view === "entries" ? "active" : ""}
          onClick={() => changeView("entries")}
          disabled={isSetupBusy && view === "settings"}
        >
          <span className="nav-icon">
            <Icon name={UI_ICONS.entries} />
          </span>
          <span>Entries</span>
        </button>
        <button
          className={view === "settings" ? "active" : ""}
          onClick={() => changeView("settings")}
          disabled={isSetupBusy && view === "settings"}
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

type ActivityGroupListProps = {
  groups: Array<{ group: ActivityGroup; activities: Activity[] }>;
  activityQuery: string;
  selectedActivityIds: string[];
  selectedDate: string;
  isLoadingDate: boolean;
  pendingSelectionKeys: Set<string>;
  onToggleActivity: (id: string) => void;
};

function ActivityGroupList({
  groups,
  activityQuery,
  selectedActivityIds,
  selectedDate,
  isLoadingDate,
  pendingSelectionKeys,
  onToggleActivity,
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
}: {
  goal: Goal;
  activity?: Activity;
  checked: boolean;
  pending: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const detail =
    goal.scheduleType === "daily"
      ? "Every day"
      : goal.scheduleType === "times_per_week"
        ? `${goal.targetPerWeek ?? 1} times this week`
        : "Selected days";
  const unavailable = pending || disabled;
  return (
    <button
      className={`goal-row ${checked ? "checked" : ""}`}
      onClick={onToggle}
      disabled={unavailable}
      aria-pressed={checked}
      aria-busy={pending}
      aria-disabled={unavailable}
    >
      <span className="goal-checkbox">
        {checked && <Icon name={UI_ICONS.check} />}
      </span>
      <span className="goal-copy">
        <strong>{goal.name}</strong>
        <small>
          {pending
            ? "Saving…"
            : disabled
              ? "Loading day…"
              : `${detail}${activity ? ` · ${activity.name}` : ""}`}
        </small>
      </span>
      {pending && (
        <span className="sr-only" role="status">
          Saving {goal.name}…
        </span>
      )}
    </button>
  );
}

function EntriesView({
  data,
  onEdit,
  onLoadMore,
  hasMore,
  isLoadingMore,
}: {
  data: Bootstrap;
  onEdit: (date: string) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  isLoadingMore: boolean;
}) {
  return (
    <section className="page-section">
      <div className="page-intro">
        <p className="eyebrow">Your history</p>
        <h1>Recent entries</h1>
        <p className="muted">
          A quiet timeline of the days you have chosen to remember.
        </p>
      </div>
      {data.entries.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">
            <Icon name="event_available" />
          </span>
          <h2>Your timeline starts here</h2>
          <p>Save your first daily check-in and it will appear here.</p>
        </div>
      ) : (
        <>
          <div className="timeline">
            {data.entries.map((entry) => {
              const mood = moodFor(data.moods, entry.moodId);
              return (
                <button
                  className="timeline-card"
                  key={entry.id}
                  onClick={() => onEdit(entry.logicalDate)}
                >
                  <span
                    className="timeline-mood"
                    style={{ background: mood?.color }}
                  >
                    {mood?.emoji}
                  </span>
                  <span className="timeline-copy">
                    <strong>{shortDate(entry.logicalDate)}</strong>
                    <span>
                      {mood?.name} · {entry.activityIds.length} activities
                      {entry.completedGoalIds.length
                        ? ` · ${entry.completedGoalIds.length} goals`
                        : ""}
                    </span>
                  </span>
                  <span className="timeline-arrow">
                    <Icon name="chevron_right" />
                  </span>
                </button>
              );
            })}
          </div>
          {hasMore && (
            <button
              className="load-more-button"
              onClick={onLoadMore}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? "Loading older entries…" : "Load older entries"}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function CalendarView({
  month,
  dates,
  today,
  isLoading,
  onMonth,
  onOpenDate,
}: {
  month: string;
  dates: string[];
  today: string;
  isLoading: boolean;
  onMonth: (month: string) => void;
  onOpenDate: (date: string) => void;
}) {
  const resolvedMonth = /^\d{4}-\d{2}$/.test(month) ? month : today.slice(0, 7);
  const [year, monthNumber] = resolvedMonth.split("-").map(Number);
  const firstDay = new Date(year, monthNumber - 1, 1).getDay();
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const filled = new Set(dates);
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
          Filled days have an entry. Select any day to open or add its check-in.
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
          {cells.map((date, index) =>
            date ? (
              <button
                key={date}
                className={`calendar-day ${filled.has(date) ? "filled" : ""} ${date === today ? "today" : ""}`}
                onClick={() => onOpenDate(date)}
                aria-label={`${date}${filled.has(date) ? ", entry exists" : ", empty"}`}
              >
                <span>{Number(date.slice(-2))}</span>
                {filled.has(date) && <Icon name={UI_ICONS.check} />}
              </button>
            ) : (
              <span className="calendar-blank" key={`blank-${index}`} />
            ),
          )}
        </div>
        {isLoading && (
          <p className="calendar-loading" role="status">
            Checking this month…
          </p>
        )}
        <div className="calendar-legend">
          <span>
            <i className="legend-dot filled" /> Entry
          </span>
          <span>
            <i className="legend-dot" /> Empty
          </span>
        </div>
      </section>
    </section>
  );
}
