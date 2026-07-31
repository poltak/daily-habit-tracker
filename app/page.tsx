"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type Activity,
  type Bootstrap,
  type Entry,
  type Goal,
  type Mood,
  isLogicalDate,
} from "../lib/daylio";
import { ACTIVITY_ICON_CHOICES, UI_ICONS } from "../lib/icons";

type View = "log" | "calendar" | "entries" | "settings";
type Draft = {
  moodId: string;
  activityIds: string[];
  completedGoalIds: string[];
  localTime: string;
  version?: number;
};

const EMPTY_DRAFT: Draft = { moodId: "", activityIds: [], completedGoalIds: [], localTime: "23:00" };

function Icon({ name, className = "" }: { name: string; className?: string }) {
  return <span className={`material-symbols-rounded ${className}`} aria-hidden="true">{name}</span>;
}

function friendlyDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(year, month - 1, day));
}

function shortDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(year, month - 1, day));
}

function getEntryForDate(entries: Entry[], date: string) {
  return entries.find((entry) => entry.logicalDate === date && !entry.deletedAt);
}

function draftFromEntry(entry: Entry | null): Draft {
  if (!entry) return { ...EMPTY_DRAFT };
  return { moodId: entry.moodId, activityIds: entry.activityIds, completedGoalIds: entry.completedGoalIds, localTime: entry.localTime, version: entry.version };
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
  const [hasMoreEntries, setHasMoreEntries] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState("");
  const [calendarDates, setCalendarDates] = useState<string[]>([]);
  const [isLoadingCalendar, setIsLoadingCalendar] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function loadBootstrap() {
    const response = await fetch("/api/bootstrap", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not connect to your journal.");
    const next = (await response.json()) as Bootstrap;
    setData(next);
    setSelectedDate((current) => current || next.today);
    setCalendarMonth((current) => current || next.today.slice(0, 7));
    setHasMoreEntries(next.entries.length >= 30);
    setDraft(draftFromEntry(getEntryForDate(next.entries, next.today) ?? null));
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/bootstrap", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not connect to your journal.");
        return (await response.json()) as Bootstrap;
      })
      .then((next) => {
        if (cancelled) return;
        setData(next);
        setSelectedDate(next.today);
        setCalendarMonth(next.today.slice(0, 7));
        setHasMoreEntries(next.entries.length >= 30);
        setDraft(draftFromEntry(getEntryForDate(next.entries, next.today) ?? null));
      })
      .catch((error: Error) => {
        if (!cancelled) setMessage({ kind: "error", text: error.message });
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (window.location.hostname !== "localhost" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (view !== "calendar" || !/^\d{4}-\d{2}$/.test(calendarMonth)) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return null;
      setIsLoadingCalendar(true);
      return fetch(`/api/calendar?month=${calendarMonth}`, { cache: "no-store" });
    }).then(async (response) => {
      if (!response) return null;
      if (!response.ok) throw new Error("Could not load that month.");
      return (await response.json()) as { dates: string[] };
    }).then((result) => { if (result && !cancelled) setCalendarDates(result.dates); })
      .catch((error: Error) => { if (!cancelled) setMessage({ kind: "error", text: error.message }); })
      .finally(() => { if (!cancelled) setIsLoadingCalendar(false); });
    return () => { cancelled = true; };
  }, [calendarMonth, view]);

  async function chooseDate(nextDate: string) {
    if (!isLogicalDate(nextDate)) return;
    setSelectedDate(nextDate);
    setCalendarMonth(nextDate.slice(0, 7));
    setMessage(null);
    const localEntry = data ? getEntryForDate(data.entries, nextDate) : null;
    if (localEntry) {
      setDraft(draftFromEntry(localEntry));
      return;
    }
    setIsLoadingDate(true);
    try {
      const response = await fetch(`/api/entries/${nextDate}`, { cache: "no-store" });
      if (response.status === 404) setDraft({ ...EMPTY_DRAFT });
      else if (!response.ok) throw new Error("Could not load that date.");
      else setDraft(draftFromEntry(((await response.json()) as { entry: Entry }).entry));
    } catch (error) {
      setMessage({ kind: "error", text: (error as Error).message });
    } finally {
      setIsLoadingDate(false);
    }
  }

  function updateDraft(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setMessage(null);
  }

  function toggleActivity(id: string) {
    updateDraft({ activityIds: draft.activityIds.includes(id) ? draft.activityIds.filter((item) => item !== id) : [...draft.activityIds, id] });
  }

  function toggleGoal(id: string) {
    updateDraft({ completedGoalIds: draft.completedGoalIds.includes(id) ? draft.completedGoalIds.filter((item) => item !== id) : [...draft.completedGoalIds, id] });
  }

  async function saveEntry() {
    if (!draft.moodId) {
      setMessage({ kind: "error", text: "Pick the mood that best sums up the day." });
      return;
    }
    setIsSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/entries/${selectedDate}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) });
      const result = (await response.json()) as { entry?: Entry; error?: string };
      if (!response.ok || !result.entry) throw new Error(result.error ?? "Could not save the entry.");
      setData((current) => current ? { ...current, entries: [result.entry!, ...current.entries.filter((entry) => entry.logicalDate !== selectedDate)] } : current);
      setDraft(draftFromEntry(result.entry));
      setMessage({ kind: "success", text: `Saved ${shortDate(selectedDate)}.` });
    } catch (error) {
      setMessage({ kind: "error", text: (error as Error).message });
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteSelectedEntry() {
    if (!draft.version || !window.confirm(`Delete the entry for ${friendlyDate(selectedDate)}?`)) return;
    const response = await fetch(`/api/entries/${selectedDate}?expectedVersion=${draft.version}`, { method: "DELETE" });
    if (!response.ok) {
      setMessage({ kind: "error", text: "Could not delete that entry." });
      return;
    }
    setData((current) => current ? { ...current, entries: current.entries.filter((entry) => entry.logicalDate !== selectedDate) } : current);
    setDraft({ ...EMPTY_DRAFT });
    setMessage({ kind: "success", text: "Entry deleted." });
  }

  async function loadOlderEntries() {
    if (!data || isLoadingMore || !hasMoreEntries) return;
    setIsLoadingMore(true);
    try {
      const response = await fetch(`/api/entries?limit=30&offset=${data.entries.length}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load older entries.");
      const result = (await response.json()) as { entries: Entry[]; hasMore: boolean };
      setData((current) => current ? { ...current, entries: [...current.entries, ...result.entries.filter((entry) => !current.entries.some((existing) => existing.id === entry.id))] } : current);
      setHasMoreEntries(result.hasMore);
    } catch (error) {
      setMessage({ kind: "error", text: (error as Error).message });
    } finally {
      setIsLoadingMore(false);
    }
  }

  if (!data) return <main className="app-loading"><div className="brand-mark">d</div><p>Opening your journal…</p></main>;

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView("log")} aria-label="Go to log"><span className="brand-mark">d</span><span>daymark</span></button>
        <div className="topbar-date">{view === "log" ? friendlyDate(selectedDate) : view === "calendar" ? "Your calendar" : view === "entries" ? "Your entries" : "Your setup"}</div>
        <div className="connection-pill"><Icon name={UI_ICONS.sync} /> synced</div>
      </header>

      <main className="content-shell">
        {message && view !== "log" && <div className={`notice ${message.kind}`} role="status">{message.kind === "success" ? "✓" : "!"} {message.text}</div>}
        {view === "log" && <LogView data={data} selectedDate={selectedDate} draft={draft} activityQuery={activityQuery} isLoadingDate={isLoadingDate} onDate={chooseDate} onDraft={updateDraft} onActivityQuery={setActivityQuery} onToggleActivity={toggleActivity} onToggleGoal={toggleGoal} onSave={saveEntry} onDelete={deleteSelectedEntry} isSaving={isSaving} message={message} />}
        {view === "calendar" && <CalendarView month={calendarMonth} dates={calendarDates} today={data.today} isLoading={isLoadingCalendar} onMonth={setCalendarMonth} onOpenDate={(date) => { setView("log"); void chooseDate(date); }} />}
        {view === "entries" && <EntriesView data={data} onEdit={(date) => { setView("log"); void chooseDate(date); }} onLoadMore={loadOlderEntries} hasMore={hasMoreEntries} isLoadingMore={isLoadingMore} />}
        {view === "settings" && <SettingsView data={data} onRefresh={loadBootstrap} onMessage={setMessage} />}
      </main>

      <nav className="bottom-nav" aria-label="Primary navigation">
        <button className={view === "log" ? "active" : ""} onClick={() => setView("log")}><span className="nav-icon"><Icon name={UI_ICONS.log} /></span><span>Log</span></button>
        <button className={view === "calendar" ? "active" : ""} onClick={() => setView("calendar")}><span className="nav-icon"><Icon name={UI_ICONS.calendar} /></span><span>Calendar</span></button>
        <button className={view === "entries" ? "active" : ""} onClick={() => setView("entries")}><span className="nav-icon"><Icon name={UI_ICONS.entries} /></span><span>Entries</span></button>
        <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}><span className="nav-icon"><Icon name={UI_ICONS.settings} /></span><span>Setup</span></button>
      </nav>
    </div>
  );
}

function LogView({ data, selectedDate, draft, activityQuery, isLoadingDate, onDate, onDraft, onActivityQuery, onToggleActivity, onToggleGoal, onSave, onDelete, isSaving, message }: {
  data: Bootstrap;
  selectedDate: string;
  draft: Draft;
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
  message: { kind: "success" | "error"; text: string } | null;
}) {
  const existing = getEntryForDate(data.entries, selectedDate);
  const groups = useMemo(() => {
    const query = activityQuery.trim().toLowerCase();
    return data.groups.filter((group) => !group.archived).map((group) => ({ group, activities: data.activities.filter((activity) => activity.groupId === group.id && !activity.archived && (!query || activity.name.toLowerCase().includes(query))).sort((a, b) => a.sortOrder - b.sortOrder) })).filter((item) => item.activities.length);
  }, [activityQuery, data.activities, data.groups]);

  return <>
    <section className="hero-card">
      <div>
        <p className="eyebrow">One small check-in</p>
        <h1>How did your day feel?</h1>
        <p className="muted">Capture the shape of the day while it is still close.</p>
      </div>
      <div className="date-switcher" aria-label="Choose the logical day">
        <button className={selectedDate === data.today ? "selected" : ""} onClick={() => onDate(data.today)}>Today</button>
        <button className={selectedDate === data.yesterday ? "selected" : ""} onClick={() => onDate(data.yesterday)}>Yesterday</button>
        <label className="date-input"><span>Other</span><input type="date" value={selectedDate} onChange={(event) => onDate(event.target.value)} /></label>
      </div>
    </section>

    {message && <div className={`notice ${message.kind}`} role="status">{message.kind === "success" ? "✓" : "!"} {message.text}</div>}

    <section className="panel mood-panel">
      <div className="section-heading"><div><p className="eyebrow">Overall mood</p><h2>Pick one</h2></div><span className="required-label">required</span></div>
      <div className="mood-grid">{data.moods.map((mood) => <button key={mood.id} className={`mood-option ${draft.moodId === mood.id ? "selected" : ""}`} style={{ "--mood-color": mood.color } as React.CSSProperties} aria-pressed={draft.moodId === mood.id} onClick={() => onDraft({ moodId: mood.id })}><span className="mood-emoji">{mood.emoji}</span><span>{mood.name}</span></button>)}</div>
    </section>

    <section className="panel activities-panel">
      <div className="section-heading"><div><p className="eyebrow">Activities</p><h2>What shaped the day?</h2></div><span className="selection-count">{draft.activityIds.length} selected</span></div>
      {draft.activityIds.length > 0 && <div className="selection-row">{draft.activityIds.map((id) => { const activity = activityFor(data.activities, id); return activity ? <button key={id} className="selection-chip" onClick={() => onToggleActivity(id)}><Icon name={activity.icon} /> {activity.name} <span><Icon name={UI_ICONS.close} /></span></button> : null; })}</div>}
      <label className="search-field"><Icon name={UI_ICONS.search} /><input value={activityQuery} onChange={(event) => onActivityQuery(event.target.value)} placeholder="Search your activities" aria-label="Search activities" /></label>
      {isLoadingDate ? <div className="inline-loading">Loading that day…</div> : <div className="activity-groups">{groups.map(({ group, activities }) => <details key={group.id} open={!activityQuery}><summary><span>{group.name}</span><span>{activities.filter((activity) => draft.activityIds.includes(activity.id)).length} selected</span></summary><div className="activity-grid">{activities.map((activity) => <button key={activity.id} className={`activity-button ${draft.activityIds.includes(activity.id) ? "selected" : ""}`} aria-pressed={draft.activityIds.includes(activity.id)} onClick={() => onToggleActivity(activity.id)}><span className="activity-icon"><Icon name={activity.icon} /></span><span>{activity.name}</span>{draft.activityIds.includes(activity.id) && <span className="check-mark"><Icon name={UI_ICONS.check} /></span>}</button>)}</div></details>)}{groups.length === 0 && <p className="empty-inline">No activities match that search.</p>}</div>}
    </section>

    <section className="panel goals-panel">
      <div className="section-heading"><div><p className="eyebrow">Goals</p><h2>Keep the promises that matter</h2></div></div>
      <div className="goal-list">{data.goals.filter((goal) => !goal.archived).map((goal) => <GoalRow key={goal.id} goal={goal} activity={activityFor(data.activities, goal.activityId)} checked={draft.completedGoalIds.includes(goal.id)} onToggle={() => onToggleGoal(goal.id)} />)}</div>
    </section>

    <div className="save-bar"><div><strong>{existing ? "Edit this entry" : "Ready to save?"}</strong><span>{friendlyDate(selectedDate)} · {draft.activityIds.length} activities</span></div><div className="save-actions">{existing && <button className="ghost-button danger" onClick={onDelete}>Delete</button>}<button className="primary-button" onClick={onSave} disabled={isSaving}>{isSaving ? "Saving…" : existing ? "Update entry" : "Save entry"}</button></div></div>
  </>;
}

function GoalRow({ goal, activity, checked, onToggle }: { goal: Goal; activity?: Activity; checked: boolean; onToggle: () => void }) {
  const detail = goal.scheduleType === "daily" ? "Every day" : goal.scheduleType === "times_per_week" ? `${goal.targetPerWeek ?? 1} times this week` : "Selected days";
  return <button className={`goal-row ${checked ? "checked" : ""}`} onClick={onToggle} aria-pressed={checked}><span className="goal-checkbox">{checked && <Icon name={UI_ICONS.check} />}</span><span className="goal-copy"><strong>{goal.name}</strong><small>{detail}{activity ? ` · ${activity.name}` : ""}</small></span><span className="goal-arrow"><Icon name="chevron_right" /></span></button>;
}

function EntriesView({ data, onEdit, onLoadMore, hasMore, isLoadingMore }: { data: Bootstrap; onEdit: (date: string) => void; onLoadMore: () => void; hasMore: boolean; isLoadingMore: boolean }) {
  return <section className="page-section"><div className="page-intro"><p className="eyebrow">Your history</p><h1>Recent entries</h1><p className="muted">A quiet timeline of the days you have chosen to remember.</p></div>{data.entries.length === 0 ? <div className="empty-state"><span className="empty-icon"><Icon name="event_available" /></span><h2>Your timeline starts here</h2><p>Save your first daily check-in and it will appear here.</p></div> : <><div className="timeline">{data.entries.map((entry) => { const mood = moodFor(data.moods, entry.moodId); return <button className="timeline-card" key={entry.id} onClick={() => onEdit(entry.logicalDate)}><span className="timeline-mood" style={{ background: mood?.color }}>{mood?.emoji}</span><span className="timeline-copy"><strong>{shortDate(entry.logicalDate)}</strong><span>{mood?.name} · {entry.activityIds.length} activities{entry.completedGoalIds.length ? ` · ${entry.completedGoalIds.length} goals` : ""}</span></span><span className="timeline-arrow"><Icon name="chevron_right" /></span></button>; })}</div>{hasMore && <button className="load-more-button" onClick={onLoadMore} disabled={isLoadingMore}>{isLoadingMore ? "Loading older entries…" : "Load older entries"}</button>}</>}</section>;
}

function CalendarView({ month, dates, today, isLoading, onMonth, onOpenDate }: { month: string; dates: string[]; today: string; isLoading: boolean; onMonth: (month: string) => void; onOpenDate: (date: string) => void }) {
  const resolvedMonth = /^\d{4}-\d{2}$/.test(month) ? month : today.slice(0, 7);
  const [year, monthNumber] = resolvedMonth.split("-").map(Number);
  const firstDay = new Date(year, monthNumber - 1, 1).getDay();
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const filled = new Set(dates);
  const cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => `${resolvedMonth}-${String(index + 1).padStart(2, "0")}`)];
  const label = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(new Date(year, monthNumber - 1, 1));
  function shiftMonth(amount: number) {
    const next = new Date(year, monthNumber - 1 + amount, 1);
    onMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
  }
  return <section className="page-section calendar-page"><div className="page-intro"><p className="eyebrow">Your history</p><h1>Calendar</h1><p className="muted">Filled days have an entry. Select any day to open or add its check-in.</p></div><section className="calendar-card"><div className="calendar-heading"><button className="icon-button" aria-label="Previous month" onClick={() => shiftMonth(-1)}><Icon name="chevron_left" /></button><h2>{label}</h2><button className="icon-button" aria-label="Next month" onClick={() => shiftMonth(1)}><Icon name="chevron_right" /></button></div><div className="calendar-weekdays">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{cells.map((date, index) => date ? <button key={date} className={`calendar-day ${filled.has(date) ? "filled" : ""} ${date === today ? "today" : ""}`} onClick={() => onOpenDate(date)} aria-label={`${date}${filled.has(date) ? ", entry exists" : ", empty"}`}><span>{Number(date.slice(-2))}</span>{filled.has(date) && <Icon name={UI_ICONS.check} />}</button> : <span className="calendar-blank" key={`blank-${index}`} />)}</div>{isLoading && <p className="calendar-loading">Checking this month…</p>}<div className="calendar-legend"><span><i className="legend-dot filled" /> Entry</span><span><i className="legend-dot" /> Empty</span></div></section></section>;
}

function iconLabel(name: string) {
  return name.replaceAll("_", " ");
}

function IconPicker({ activityName, currentIcon, onClose, onSelect }: { activityName: string; currentIcon: string; onClose: () => void; onSelect: (icon: string) => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const categories = ["All", ...Array.from(new Set(ACTIVITY_ICON_CHOICES.map((choice) => choice.category)))];
  const normalizedQuery = query.trim().toLowerCase();
  const choices = ACTIVITY_ICON_CHOICES.filter((choice) => (category === "All" || choice.category === category) && (!normalizedQuery || `${choice.name} ${choice.category}`.includes(normalizedQuery)));

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return <div className="icon-picker-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="icon-picker" role="dialog" aria-modal="true" aria-labelledby="icon-picker-title" onMouseDown={(event) => event.stopPropagation()}><div className="icon-picker-header"><div><p className="eyebrow">Activity icon</p><h2 id="icon-picker-title">Choose an icon</h2><p className="muted">For {activityName}</p></div><button className="icon-button" aria-label="Close icon picker" onClick={onClose}><Icon name={UI_ICONS.close} /></button></div><label className="search-field icon-picker-search"><Icon name={UI_ICONS.search} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search icons by name or category" aria-label="Search icons" /></label><div className="icon-picker-categories" role="toolbar" aria-label="Icon categories">{categories.map((item) => <button key={item} className={category === item ? "selected" : ""} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div><p className="icon-picker-count">{choices.length} icons</p>{choices.length ? <div className="icon-picker-grid" aria-label="Available icons">{choices.map((choice) => <button key={choice.name} className={`icon-choice ${currentIcon === choice.name ? "selected" : ""}`} aria-label={`Use ${iconLabel(choice.name)} icon`} aria-pressed={currentIcon === choice.name} onClick={() => onSelect(choice.name)}><Icon name={choice.name} /><span>{iconLabel(choice.name)}</span></button>)}</div> : <div className="empty-inline">No icons match that search.</div>}</section></div>;
}

function SettingsView({ data, onRefresh, onMessage }: { data: Bootstrap; onRefresh: () => Promise<void>; onMessage: (message: { kind: "success" | "error"; text: string }) => void }) {
  const [groupName, setGroupName] = useState("");
  const [activityName, setActivityName] = useState("");
  const [activityGroup, setActivityGroup] = useState(data.groups.find((group) => !group.archived)?.id ?? "");
  const [goalName, setGoalName] = useState("");
  const [goalActivity, setGoalActivity] = useState(data.activities.find((activity) => !activity.archived)?.id ?? "");
  const [goalSchedule, setGoalSchedule] = useState<Goal["scheduleType"]>("daily");
  const [activityQuery, setActivityQuery] = useState("");
  const [iconPickerActivity, setIconPickerActivity] = useState<{ id: string; name: string; icon: string } | null>(null);

  async function create(payload: Record<string, unknown>, reset: () => void) {
    try {
      const response = await fetch("/api/catalog", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not save setup.");
      reset();
      await onRefresh();
      onMessage({ kind: "success", text: "Setup updated." });
    } catch (error) {
      onMessage({ kind: "error", text: (error as Error).message });
    }
  }

  async function patchCatalog(kind: "group" | "activity" | "goal", id: string, patch: Record<string, unknown>, success = "Setup updated.") {
    try {
      const response = await fetch(`/api/catalog/${kind}/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not update setup.");
      await onRefresh();
      onMessage({ kind: "success", text: success });
    } catch (error) {
      onMessage({ kind: "error", text: (error as Error).message });
    }
  }

  async function rename(kind: "group" | "activity" | "goal", id: string, current: string) {
    const name = window.prompt("New name", current)?.trim();
    if (name && name !== current) await patchCatalog(kind, id, { name });
  }

  async function chooseIcon(icon: string) {
    if (!iconPickerActivity || icon === iconPickerActivity.icon) {
      setIconPickerActivity(null);
      return;
    }
    await patchCatalog("activity", iconPickerActivity.id, { icon });
    setIconPickerActivity(null);
  }

  async function move(kind: "group" | "goal" | "activity", item: { id: string; sortOrder: number }, items: Array<{ id: string; sortOrder: number }>, direction: -1 | 1) {
    const ordered = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
    const index = ordered.findIndex((candidate) => candidate.id === item.id);
    const swap = ordered[index + direction];
    if (!swap) return;
    try {
      const updates = await Promise.all([item, swap].map((candidate, candidateIndex) => fetch(`/api/catalog/${kind}/${candidate.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ sortOrder: candidateIndex === 0 ? swap.sortOrder : item.sortOrder }) })));
      if (updates.some((response) => !response.ok)) throw new Error("Could not reorder setup.");
      await onRefresh();
    } catch (error) {
      onMessage({ kind: "error", text: (error as Error).message });
    }
  }

  async function archive(kind: "group" | "activity" | "goal", id: string, archived: boolean) {
    await patchCatalog(kind, id, { archived: !archived }, archived ? "Restored." : "Archived.");
  }

  async function cycleGoal(goal: Goal) {
    const next: Goal["scheduleType"] = goal.scheduleType === "daily" ? "weekdays" : goal.scheduleType === "weekdays" ? "times_per_week" : "daily";
    const targetPerWeek = next === "times_per_week" ? Number(window.prompt("How many times per week?", String(goal.targetPerWeek ?? 3))) : undefined;
    await patchCatalog("goal", goal.id, { scheduleType: next, ...(targetPerWeek && targetPerWeek >= 1 && targetPerWeek <= 7 ? { targetPerWeek } : {}) }, "Goal schedule updated.");
  }

  async function exportData() {
    const response = await fetch("/api/export");
    if (!response.ok) { onMessage({ kind: "error", text: "Could not export your data." }); return; }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = "daylio-clone-export.json"; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    onMessage({ kind: "success", text: "Export downloaded." });
  }

  const activeGroups = data.groups.filter((group) => !group.archived);
  const activeActivities = data.activities.filter((activity) => !activity.archived);
  const importedGoals = data.goals.filter((goal) => goal.sourceState !== undefined);
  const query = activityQuery.trim().toLowerCase();
  function goalActivityOptions(goal: Goal) {
    const linked = data.activities.find((activity) => activity.id === goal.activityId);
    return linked && linked.archived && !activeActivities.some((activity) => activity.id === linked.id) ? [...activeActivities, linked] : activeActivities;
  }

  return <><section className="page-section settings-page"><div className="page-intro"><p className="eyebrow">Your setup</p><h1>Make it yours</h1><p className="muted">Create, rename, regroup, reorder, archive, and restore your catalog.</p></div>
    <section className="settings-card"><div className="section-heading"><div><p className="eyebrow">Activity groups</p><h2>{activeGroups.length} active · {data.groups.length} total</h2></div></div><div className="management-list">{data.groups.map((group, index, all) => <div className={`management-row ${group.archived ? "archived" : ""}`} key={group.id}><span className="management-icon"><Icon name="folder" /></span><span className="management-copy"><strong>{group.name}</strong><small>{data.activities.filter((activity) => activity.groupId === group.id && !activity.archived).length} active activities{group.archived ? " · archived" : ""}</small></span><span className="management-actions"><button className="tiny-button" aria-label={`Rename ${group.name}`} onClick={() => void rename("group", group.id, group.name)}><Icon name={UI_ICONS.edit} /></button><button className="tiny-button" aria-label={`Move ${group.name} up`} disabled={index === 0} onClick={() => void move("group", group, all, -1)}><Icon name={UI_ICONS.moveUp} /></button><button className="tiny-button" aria-label={`Move ${group.name} down`} disabled={index === all.length - 1} onClick={() => void move("group", group, all, 1)}><Icon name={UI_ICONS.moveDown} /></button><button className="tiny-button" aria-label={group.archived ? `Restore ${group.name}` : `Archive ${group.name}`} onClick={() => void archive("group", group.id, group.archived)}><Icon name={group.archived ? UI_ICONS.restore : UI_ICONS.archive} /></button></span></div>)}</div><div className="inline-form"><input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="New group name" /><button className="secondary-button" onClick={() => void create({ kind: "group", name: groupName }, () => setGroupName(""))}><Icon name={UI_ICONS.add} /> Add group</button></div></section>
    <section className="settings-card"><div className="section-heading"><div><p className="eyebrow">Activities</p><h2>{activeActivities.length} active activities</h2></div></div><label className="search-field"><Icon name={UI_ICONS.search} /><input value={activityQuery} onChange={(event) => setActivityQuery(event.target.value)} placeholder="Filter activities to manage" aria-label="Filter activities to manage" /></label><div className="management-groups">{data.groups.map((group) => { const activities = data.activities.filter((activity) => activity.groupId === group.id && (!query || activity.name.toLowerCase().includes(query))).sort((a, b) => a.sortOrder - b.sortOrder); return activities.length ? <details key={group.id} open={Boolean(query) || !group.archived}><summary><span>{group.name}</span><small>{activities.length}</small></summary><div className="management-list">{activities.map((activity, index, groupActivities) => <div className={`management-row ${activity.archived ? "archived" : ""}`} key={activity.id}><span className="management-icon"><Icon name={activity.icon} /></span><span className="management-copy"><strong>{activity.name}</strong><small>{activity.icon}{activity.archived ? " · archived" : ""}</small></span><span className="management-actions"><button className="tiny-button" aria-label={`Rename ${activity.name}`} onClick={() => void rename("activity", activity.id, activity.name)}><Icon name={UI_ICONS.edit} /></button><button className="tiny-button" aria-label={`Choose icon for ${activity.name}`} onClick={() => setIconPickerActivity({ id: activity.id, name: activity.name, icon: activity.icon })}><Icon name="palette" /></button><select className="tiny-select" aria-label={`Move ${activity.name} to group`} value={activity.groupId} onChange={(event) => void patchCatalog("activity", activity.id, { groupId: event.target.value })}>{activeGroups.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select><button className="tiny-button" aria-label={`Move ${activity.name} up`} disabled={index === 0} onClick={() => void move("activity", activity, groupActivities, -1)}><Icon name={UI_ICONS.moveUp} /></button><button className="tiny-button" aria-label={`Move ${activity.name} down`} disabled={index === groupActivities.length - 1} onClick={() => void move("activity", activity, groupActivities, 1)}><Icon name={UI_ICONS.moveDown} /></button><button className="tiny-button" aria-label={activity.archived ? `Restore ${activity.name}` : `Archive ${activity.name}`} onClick={() => void archive("activity", activity.id, activity.archived)}><Icon name={activity.archived ? UI_ICONS.restore : UI_ICONS.archive} /></button></span></div>)}</div></details> : null; })}</div><div className="inline-form stacked-mobile"><input value={activityName} onChange={(event) => setActivityName(event.target.value)} placeholder="New activity name" /><select value={activityGroup} onChange={(event) => setActivityGroup(event.target.value)}>{activeGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><button className="secondary-button" onClick={() => void create({ kind: "activity", name: activityName, groupId: activityGroup }, () => setActivityName(""))}><Icon name={UI_ICONS.add} /> Add activity</button></div></section>
    <section className="settings-card"><div className="section-heading"><div><p className="eyebrow">Goals</p><h2>{data.goals.filter((goal) => !goal.archived).length} active · {data.goals.length} total</h2></div></div><div className="management-list">{data.goals.map((goal, index, all) => <div className={`management-row ${goal.archived ? "archived" : ""}`} key={goal.id}><span className="management-icon"><Icon name="task_alt" /></span><span className="management-copy"><strong>{goal.name}</strong><small>{goal.scheduleType === "daily" ? "Every day" : goal.scheduleType === "times_per_week" ? `${goal.targetPerWeek ?? 1} times this week` : "Selected days"} · {activityFor(data.activities, goal.activityId)?.name ?? "Unlinked"}{goal.archived ? " · archived" : ""}</small></span><span className="management-actions"><button className="tiny-button" aria-label={`Rename ${goal.name}`} onClick={() => void rename("goal", goal.id, goal.name)}><Icon name={UI_ICONS.edit} /></button><select className="tiny-select" aria-label={`Change activity for ${goal.name}`} value={goal.activityId} onChange={(event) => void patchCatalog("goal", goal.id, { activityId: event.target.value })}>{goalActivityOptions(goal).map((activity) => <option key={activity.id} value={activity.id}>{activity.name}{activity.archived ? " (archived)" : ""}</option>)}</select><button className="tiny-button" aria-label={`Cycle schedule for ${goal.name}`} onClick={() => void cycleGoal(goal)}><Icon name="repeat" /></button><button className="tiny-button" aria-label={`Move ${goal.name} up`} disabled={index === 0} onClick={() => void move("goal", goal, all, -1)}><Icon name={UI_ICONS.moveUp} /></button><button className="tiny-button" aria-label={`Move ${goal.name} down`} disabled={index === all.length - 1} onClick={() => void move("goal", goal, all, 1)}><Icon name={UI_ICONS.moveDown} /></button><button className="tiny-button" aria-label={goal.archived ? `Restore ${goal.name}` : `Archive ${goal.name}`} onClick={() => void archive("goal", goal.id, goal.archived)}><Icon name={goal.archived ? UI_ICONS.restore : UI_ICONS.archive} /></button></span></div>)}</div><div className="inline-form stacked-mobile"><input value={goalName} onChange={(event) => setGoalName(event.target.value)} placeholder="New goal name" /><select value={goalActivity} onChange={(event) => setGoalActivity(event.target.value)}>{activeActivities.map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}</select><select value={goalSchedule} onChange={(event) => setGoalSchedule(event.target.value as Goal["scheduleType"])}><option value="daily">Every day</option><option value="weekdays">Selected weekdays</option><option value="times_per_week">Several times a week</option></select><button className="secondary-button" onClick={() => void create({ kind: "goal", name: goalName, activityId: goalActivity, scheduleType: goalSchedule }, () => setGoalName(""))}><Icon name={UI_ICONS.add} /> Add goal</button></div></section>
    <section className="settings-card"><div className="section-heading"><div><p className="eyebrow">Goal-state review</p><h2>{importedGoals.length} imported goals</h2></div></div><p className="muted small-copy">Raw Daylio state codes are preserved. Review visibility here; the app does not silently reinterpret historical goal state.</p><div className="review-list">{importedGoals.map((goal) => <div className="review-row" key={goal.id}><span><strong>{goal.name}</strong><small>Daylio raw state: {goal.sourceState}</small></span><button className="secondary-button compact-button" onClick={() => void archive("goal", goal.id, goal.archived)}>{goal.archived ? "Show goal" : "Archive"}</button></div>)}</div></section>
    <section className="settings-card export-card"><div><p className="eyebrow">Portability</p><h2>Keep a copy of your data</h2><p className="muted">Download a versioned JSON export whenever you want.</p></div><button className="secondary-button" onClick={() => void exportData()}><Icon name={UI_ICONS.export} /> Export JSON</button></section>
  </section>{iconPickerActivity && <IconPicker activityName={iconPickerActivity.name} currentIcon={iconPickerActivity.icon} onClose={() => setIconPickerActivity(null)} onSelect={(icon) => void chooseIcon(icon)} />}</>;
}
