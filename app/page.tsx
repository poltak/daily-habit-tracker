"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type Activity,
  type ActivityGroup,
  type Bootstrap,
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

function draftForDate(
  logicalDate: string,
  serverEntry: Entry | null,
  serverCompletedGoalIds = serverEntry?.completedGoalIds ?? [],
) {
  const recovered = recoverStoredDraft(logicalDate, serverEntry);
  const completedGoalIds = [...new Set(serverCompletedGoalIds)];
  if (recovered)
    return { draft: { ...recovered, completedGoalIds }, restored: true };
  return {
    draft: { ...draftFromEntry(serverEntry), completedGoalIds },
    restored: false,
  };
}

function moodFor(moods: Mood[], id: string) {
  return moods.find((mood) => mood.id === id);
}

function activityFor(activities: Activity[], id: string) {
  return activities.find((activity) => activity.id === id);
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
  const draftRef = useRef(EMPTY_DRAFT);
  const dateRequestGate = useRef(createLatestRequestGate());
  const bootstrapRequestGate = useRef(createLatestRequestGate());
  const pendingGoalRef = useRef<Set<string>>(new Set());
  const selectedDateRef = useRef("");
  const selectedDateEpochRef = useRef(0);
  draftRef.current = draft;

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
    const recovered = draftForDate(
      nextDate,
      getEntryForDate(next.entries, nextDate) ?? null,
    );
    rememberDraftDate(nextDate);
    selectedDateRef.current = nextDate;
    setData(next);
    setSelectedDate(nextDate);
    setCalendarMonth((current) => current || nextDate.slice(0, 7));
    setHasMoreEntries(next.entries.length >= 30);
    setDraft(recovered.draft);
    setHasLocalDraft(recovered.restored);
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
    if (
      selectedDateRef.current &&
      hasPendingGoalToggle(selectedDateRef.current)
    ) {
      setMessage({
        kind: "info",
        text: "Wait for the goal update to finish before changing the day.",
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
      if (response.status !== 404) {
        if (!response.ok) throw new Error("Could not load that date.");
        const result = (await response.json()) as {
          entry: Entry;
          completedGoalIds?: string[];
        };
        serverEntry = result.entry;
        serverCompletedGoalIds =
          result.completedGoalIds ?? serverEntry.completedGoalIds;
      } else {
        const result = (await response.json()) as {
          completedGoalIds?: string[];
        };
        serverCompletedGoalIds = result.completedGoalIds ?? [];
      }
      if (!request.isCurrent()) return;
      const recovered = draftForDate(
        nextDate,
        serverEntry,
        serverCompletedGoalIds,
      );
      setDraft(recovered.draft);
      setHasLocalDraft(recovered.restored);
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

  function updateDraft(patch: Partial<Draft>) {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    setDraft(next);
    if (selectedDate) writeStoredDraft(selectedDate, next);
    setHasLocalDraft(true);
    setMessage(null);
  }

  function toggleActivity(id: string) {
    updateDraft({
      activityIds: draft.activityIds.includes(id)
        ? draft.activityIds.filter((item) => item !== id)
        : [...draft.activityIds, id],
    });
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
    const previousChecked = draftRef.current.completedGoalIds.includes(id);
    const nextChecked = !previousChecked;
    const dateEpoch = selectedDateEpochRef.current;
    pendingGoalRef.current.add(key);
    setGoalPending(key, true);
    setDraft((current) => {
      const next = {
        ...current,
        completedGoalIds: nextChecked
          ? [...new Set([...current.completedGoalIds, id])]
          : current.completedGoalIds.filter((item) => item !== id),
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
        completion?: { completed: boolean };
        error?: string;
      };
      if (
        !response.ok ||
        !result.completion ||
        result.completion.completed !== nextChecked
      )
        throw new Error(result.error ?? "The goal update was out of date.");
      if (
        selectedDateRef.current === logicalDate &&
        selectedDateEpochRef.current === dateEpoch &&
        result.completion.completed === nextChecked
      ) {
        setData((current) =>
          current
            ? {
                ...current,
                entries: current.entries.map((entry) =>
                  entry.logicalDate === logicalDate
                    ? {
                        ...entry,
                        completedGoalIds: nextChecked
                          ? [...new Set([...entry.completedGoalIds, id])]
                          : entry.completedGoalIds.filter(
                              (item) => item !== id,
                            ),
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
            completedGoalIds: previousChecked
              ? [...new Set([...current.completedGoalIds, id])]
              : current.completedGoalIds.filter((item) => item !== id),
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
      pendingGoalRef.current.delete(key);
      setGoalPending(key, false);
    }
  }

  async function saveEntry() {
    if (isSaving || isDeleting) return;
    if (hasPendingGoalToggle(selectedDate)) {
      setMessage({
        kind: "info",
        text: "Wait for the goal update to finish before saving the entry.",
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
      setHasLocalDraft(false);
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
    if (
      isDeleting ||
      isSaving ||
      !draft.version ||
      !window.confirm(`Delete the entry for ${friendlyDate(selectedDate)}?`)
    )
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
      setHasLocalDraft(false);
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
            onDraft={updateDraft}
            onActivityQuery={setActivityQuery}
            onToggleActivity={toggleActivity}
            onToggleGoal={toggleGoal}
            onSave={saveEntry}
            onDelete={deleteSelectedEntry}
            isSaving={isSaving}
            isDeleting={isDeleting}
            pendingGoalKeys={pendingGoalKeys}
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
  onDraft,
  onActivityQuery,
  onToggleActivity,
  onToggleGoal,
  onSave,
  onDelete,
  isSaving,
  isDeleting,
  pendingGoalKeys,
  message,
}: {
  data: Bootstrap;
  selectedDate: string;
  draft: Draft;
  hasLocalDraft: boolean;
  activityQuery: string;
  isLoadingDate: boolean;
  onDate: (date: string) => void;
  onDraft: (patch: Partial<Draft>) => void;
  onActivityQuery: (value: string) => void;
  onToggleActivity: (id: string) => void;
  onToggleGoal: (id: string) => void;
  onSave: () => void;
  onDelete: () => void;
  isSaving: boolean;
  isDeleting: boolean;
  pendingGoalKeys: Set<string>;
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

  return (
    <>
      <fieldset className="log-form" disabled={formBusy} aria-busy={formBusy}>
        <legend className="sr-only">Daily entry form</legend>
        {formBusy && (
          <p className="sr-only" role="status">
            Daily entry form disabled while {isDeleting ? "deleting" : "saving"}
            .
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
              disabled={isLoadingDate || goalsBusy}
            >
              Today
            </button>
            <button
              className={selectedDate === data.yesterday ? "selected" : ""}
              onClick={() => onDate(data.yesterday)}
              disabled={isLoadingDate || goalsBusy}
            >
              Yesterday
            </button>
            <label className="date-input">
              <span>Other</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => onDate(event.target.value)}
                disabled={isLoadingDate || goalsBusy}
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

        <section
          className="panel goals-panel"
          aria-busy={isLoadingDate || goalsBusy}
        >
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
                  disabled={isLoadingDate}
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
          <div className="mood-grid">
            {data.moods.map((mood) => (
              <button
                key={mood.id}
                className={`mood-option ${draft.moodId === mood.id ? "selected" : ""}`}
                style={{ "--mood-color": mood.color } as React.CSSProperties}
                aria-pressed={draft.moodId === mood.id}
                onClick={() => onDraft({ moodId: mood.id })}
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
              onToggleActivity={onToggleActivity}
            />
          )}
        </section>
      </fieldset>

      <div className="save-bar" aria-busy={formBusy || goalsBusy}>
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
              disabled={isDeleting || isSaving}
              aria-busy={isDeleting}
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </button>
          )}
          <button
            className="primary-button"
            onClick={onSave}
            disabled={isSaving || isDeleting || goalsBusy}
            aria-busy={isSaving}
          >
            {isSaving
              ? "Saving…"
              : goalsBusy
                ? "Updating goal…"
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
  onToggleActivity: (id: string) => void;
};

function ActivityGroupList({
  groups,
  activityQuery,
  selectedActivityIds,
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
