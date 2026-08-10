"use client";

import { useEffect, useMemo, useState } from "react";
import type { Bootstrap, Goal } from "../../lib/daylio";
import { filterActivityGroups } from "../../lib/activity-groups";
import { ACTIVITY_ICON_CHOICES, UI_ICONS } from "../../lib/icons";
import { applyTheme, THEME_MEDIA_QUERY, THEME_STORAGE_KEY, readStoredThemePreference, type ThemePreference } from "../../lib/theme";
import { Icon } from "./icon";

type SetupMessage = { kind: "success" | "error"; text: string };

export type SetupViewProps = {
  data: Bootstrap;
  onRefresh: () => Promise<void>;
  onMessage: (message: SetupMessage) => void;
};

type CatalogKind = "group" | "activity" | "goal";

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string; description: string; icon: string }> = [
  { value: "system", label: "System", description: "Follow your device setting", icon: "settings_brightness" },
  { value: "light", label: "Light", description: "Keep the warm Daymark palette", icon: "light_mode" },
  { value: "dark", label: "Dark", description: "Use a softer low-light palette", icon: "dark_mode" },
];

function iconLabel(name: string) {
  return name.replaceAll("_", " ");
}

function IconPicker({
  activityName,
  currentIcon,
  onClose,
  onSelect,
}: {
  activityName: string;
  currentIcon: string;
  onClose: () => void;
  onSelect: (icon: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const categories = ["All", ...Array.from(new Set(ACTIVITY_ICON_CHOICES.map((choice) => choice.category)))];
  const normalizedQuery = query.trim().toLowerCase();
  const choices = ACTIVITY_ICON_CHOICES.filter(
    (choice) =>
      (category === "All" || choice.category === category) &&
      (!normalizedQuery || `${choice.name} ${choice.category}`.includes(normalizedQuery)),
  );

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="icon-picker-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="icon-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="icon-picker-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="icon-picker-header">
          <div>
            <p className="eyebrow">Activity icon</p>
            <h2 id="icon-picker-title">Choose an icon</h2>
            <p className="muted">For {activityName}</p>
          </div>
          <button className="icon-button" aria-label="Close icon picker" onClick={onClose}>
            <Icon name={UI_ICONS.close} />
          </button>
        </div>
        <label className="search-field icon-picker-search">
          <Icon name={UI_ICONS.search} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search icons by name or category"
            aria-label="Search icons"
          />
        </label>
        <div className="icon-picker-categories" role="toolbar" aria-label="Icon categories">
          {categories.map((item) => (
            <button key={item} className={category === item ? "selected" : ""} aria-pressed={category === item} onClick={() => setCategory(item)}>
              {item}
            </button>
          ))}
        </div>
        <p className="icon-picker-count">{choices.length} icons</p>
        {choices.length ? (
          <div className="icon-picker-grid" aria-label="Available icons">
            {choices.map((choice) => (
              <button
                key={choice.name}
                className={`icon-choice ${currentIcon === choice.name ? "selected" : ""}`}
                aria-label={`Use ${iconLabel(choice.name)} icon`}
                aria-pressed={currentIcon === choice.name}
                onClick={() => onSelect(choice.name)}
              >
                <Icon name={choice.name} />
                <span>{iconLabel(choice.name)}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-inline">No icons match that search.</div>
        )}
      </section>
    </div>
  );
}

export function SetupView({ data, onRefresh, onMessage }: SetupViewProps) {
  const [groupName, setGroupName] = useState("");
  const [activityName, setActivityName] = useState("");
  const [activityGroup, setActivityGroup] = useState(data.groups.find((group) => !group.archived)?.id ?? "");
  const [goalName, setGoalName] = useState("");
  const [goalActivity, setGoalActivity] = useState(data.activities.find((activity) => !activity.archived)?.id ?? "");
  const [goalSchedule, setGoalSchedule] = useState<Goal["scheduleType"]>("daily");
  const [activityQuery, setActivityQuery] = useState("");
  const [iconPickerActivity, setIconPickerActivity] = useState<{ id: string; name: string; icon: string } | null>(null);
  const [themePreference, setThemePreference] = useState<ThemePreference>("system");

  useEffect(() => {
    const media = typeof window.matchMedia === "function" ? window.matchMedia(THEME_MEDIA_QUERY) : null;
    const syncTheme = () => {
      let storage: Storage | undefined;
      try {
        storage = window.localStorage;
      } catch {
        storage = undefined;
      }
      const preference = readStoredThemePreference(storage);
      setThemePreference(preference);
      applyTheme({ root: document.documentElement, preference, systemTheme: media?.matches ? "dark" : "light" });
    };

    syncTheme();
    if (media?.addEventListener) media.addEventListener("change", syncTheme);
    else if (media?.addListener) media.addListener(syncTheme);

    return () => {
      if (media?.removeEventListener) media.removeEventListener("change", syncTheme);
      else if (media?.removeListener) media.removeListener(syncTheme);
    };
  }, []);

  function updateThemePreference(preference: ThemePreference) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // Keep the current session usable when storage is blocked.
    }
    const systemTheme = typeof window.matchMedia === "function" && window.matchMedia(THEME_MEDIA_QUERY).matches ? "dark" : "light";
    applyTheme({ root: document.documentElement, preference, systemTheme });
    setThemePreference(preference);
  }

  async function create({ payload, reset }: { payload: Record<string, unknown>; reset: () => void }) {
    try {
      const response = await fetch("/api/catalog", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not save setup.");
      reset();
      await onRefresh();
      onMessage({ kind: "success", text: "Setup updated." });
    } catch (error) {
      onMessage({ kind: "error", text: (error as Error).message });
    }
  }

  async function patchCatalog({
    kind,
    id,
    patch,
    success = "Setup updated.",
  }: {
    kind: CatalogKind;
    id: string;
    patch: Record<string, unknown>;
    success?: string;
  }) {
    try {
      const response = await fetch(`/api/catalog/${kind}/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not update setup.");
      await onRefresh();
      onMessage({ kind: "success", text: success });
    } catch (error) {
      onMessage({ kind: "error", text: (error as Error).message });
    }
  }

  async function rename({ kind, id, current }: { kind: CatalogKind; id: string; current: string }) {
    const name = window.prompt("New name", current)?.trim();
    if (name && name !== current) await patchCatalog({ kind, id, patch: { name } });
  }

  async function chooseIcon(icon: string) {
    if (!iconPickerActivity || icon === iconPickerActivity.icon) {
      setIconPickerActivity(null);
      return;
    }

    await patchCatalog({ kind: "activity", id: iconPickerActivity.id, patch: { icon } });
    setIconPickerActivity(null);
  }

  async function move({
    kind,
    item,
    items,
    direction,
  }: {
    kind: CatalogKind;
    item: { id: string; sortOrder: number };
    items: Array<{ id: string; sortOrder: number }>;
    direction: -1 | 1;
  }) {
    const ordered = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
    const index = ordered.findIndex((candidate) => candidate.id === item.id);
    const swap = ordered[index + direction];
    if (!swap) return;

    try {
      const updates = await Promise.all(
        [item, swap].map((candidate, candidateIndex) =>
          fetch(`/api/catalog/${kind}/${candidate.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sortOrder: candidateIndex === 0 ? swap.sortOrder : item.sortOrder }),
          }),
        ),
      );
      if (updates.some((response) => !response.ok)) throw new Error("Could not reorder setup.");
      await onRefresh();
    } catch (error) {
      onMessage({ kind: "error", text: (error as Error).message });
    }
  }

  async function archive({ kind, id, archived }: { kind: CatalogKind; id: string; archived: boolean }) {
    await patchCatalog({ kind, id, patch: { archived: !archived }, success: archived ? "Restored." : "Archived." });
  }

  async function cycleGoal({ goal }: { goal: Goal }) {
    const next: Goal["scheduleType"] = goal.scheduleType === "daily" ? "weekdays" : goal.scheduleType === "weekdays" ? "times_per_week" : "daily";
    const targetPerWeek = next === "times_per_week" ? Number(window.prompt("How many times per week?", String(goal.targetPerWeek ?? 3))) : undefined;
    await patchCatalog({
      kind: "goal",
      id: goal.id,
      patch: { scheduleType: next, ...(targetPerWeek && targetPerWeek >= 1 && targetPerWeek <= 7 ? { targetPerWeek } : {}) },
      success: "Goal schedule updated.",
    });
  }

  async function exportData() {
    const response = await fetch("/api/export");
    if (!response.ok) {
      onMessage({ kind: "error", text: "Could not export your data." });
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "daylio-clone-export.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    onMessage({ kind: "success", text: "Export downloaded." });
  }

  const activeGroups = data.groups.filter((group) => !group.archived);
  const activeActivities = data.activities.filter((activity) => !activity.archived);
  const importedGoals = data.goals.filter((goal) => goal.sourceState !== undefined);
  const query = activityQuery.trim();
  const groupedActivities = useMemo(
    () => filterActivityGroups({ groups: data.groups, activities: data.activities, query, includeArchived: true }),
    [data.activities, data.groups, query],
  );

  function goalActivityOptions(goal: Goal) {
    const linked = data.activities.find((activity) => activity.id === goal.activityId);
    return linked && linked.archived && !activeActivities.some((activity) => activity.id === linked.id) ? [...activeActivities, linked] : activeActivities;
  }

  return (
    <>
      <section className="page-section settings-page">
        <div className="page-intro">
          <p className="eyebrow">Your setup</p>
          <h1>Make it yours</h1>
          <p className="muted">Create, rename, regroup, reorder, archive, and restore your catalog.</p>
        </div>

        <section className="settings-card appearance-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Appearance</p>
              <h2>Choose your theme</h2>
              <p className="muted small-copy">System follows your device. Your choice is saved on this device.</p>
            </div>
          </div>
          <div className="theme-options" role="radiogroup" aria-label="Appearance theme">
            {THEME_OPTIONS.map((option) => (
              <label className={`theme-option ${themePreference === option.value ? "selected" : ""}`} key={option.value}>
                <input
                  type="radio"
                  name="theme-preference"
                  value={option.value}
                  checked={themePreference === option.value}
                  onChange={() => updateThemePreference(option.value)}
                />
                <span className="theme-option-content">
                  <span className="theme-option-icon"><Icon name={option.icon} /></span>
                  <span className="theme-option-copy"><strong>{option.label}</strong><small>{option.description}</small></span>
                  <span className="theme-option-check"><Icon name={UI_ICONS.check} /></span>
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="settings-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Activity groups</p>
              <h2>{activeGroups.length} active · {data.groups.length} total</h2>
            </div>
          </div>
          <div className="management-list">
            {data.groups.map((group, index, all) => (
              <div className={`management-row ${group.archived ? "archived" : ""}`} key={group.id}>
                <span className="management-icon"><Icon name="folder" /></span>
                <span className="management-copy">
                  <strong>{group.name}</strong>
                  <small>{data.activities.filter((activity) => activity.groupId === group.id && !activity.archived).length} active activities{group.archived ? " · archived" : ""}</small>
                </span>
                <span className="management-actions">
                  <button className="tiny-button" aria-label={`Rename ${group.name}`} onClick={() => void rename({ kind: "group", id: group.id, current: group.name })}><Icon name={UI_ICONS.edit} /></button>
                  <button className="tiny-button" aria-label={`Move ${group.name} up`} disabled={index === 0} onClick={() => void move({ kind: "group", item: group, items: all, direction: -1 })}><Icon name={UI_ICONS.moveUp} /></button>
                  <button className="tiny-button" aria-label={`Move ${group.name} down`} disabled={index === all.length - 1} onClick={() => void move({ kind: "group", item: group, items: all, direction: 1 })}><Icon name={UI_ICONS.moveDown} /></button>
                  <button className="tiny-button" aria-label={group.archived ? `Restore ${group.name}` : `Archive ${group.name}`} onClick={() => void archive({ kind: "group", id: group.id, archived: group.archived })}><Icon name={group.archived ? UI_ICONS.restore : UI_ICONS.archive} /></button>
                </span>
              </div>
            ))}
          </div>
          <div className="inline-form">
            <input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="New group name" />
            <button className="secondary-button" onClick={() => void create({ payload: { kind: "group", name: groupName }, reset: () => setGroupName("") })}><Icon name={UI_ICONS.add} /> Add group</button>
          </div>
        </section>

        <section className="settings-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Activities</p>
              <h2>{activeActivities.length} active activities</h2>
            </div>
          </div>
          <label className="search-field">
            <Icon name={UI_ICONS.search} />
            <input value={activityQuery} onChange={(event) => setActivityQuery(event.target.value)} placeholder="Filter activities to manage" aria-label="Filter activities to manage" />
          </label>
          <div className="management-groups">
            {groupedActivities.map(({ group, activities, activeCount, archivedCount }) => {
              const totalLabel = `${activeCount} active${archivedCount ? ` · ${archivedCount} archived` : ""}`;
              return (
                <details key={group.id} open={Boolean(query) || undefined}>
                  <summary>
                    <span>{group.name}{group.archived ? " · archived" : ""}</span>
                    <span className="management-group-meta"><span>{totalLabel}</span><Icon name="expand_more" className="group-expand-icon" /></span>
                  </summary>
                  <div className="management-list">
                    {activities.map((activity, index, groupActivities) => (
                      <div className={`management-row ${activity.archived ? "archived" : ""}`} key={activity.id}>
                        <span className="management-icon"><Icon name={activity.icon} /></span>
                        <span className="management-copy">
                          <strong>{activity.name}</strong>
                          <small>{activity.icon}{activity.archived ? " · archived" : ""}</small>
                        </span>
                        <span className="management-actions">
                          <button className="tiny-button" aria-label={`Rename ${activity.name}`} onClick={() => void rename({ kind: "activity", id: activity.id, current: activity.name })}><Icon name={UI_ICONS.edit} /></button>
                          <button className="tiny-button" aria-label={`Choose icon for ${activity.name}`} onClick={() => setIconPickerActivity({ id: activity.id, name: activity.name, icon: activity.icon })}><Icon name="palette" /></button>
                          <select className="tiny-select" aria-label={`Move ${activity.name} to group`} value={activity.groupId} onChange={(event) => void patchCatalog({ kind: "activity", id: activity.id, patch: { groupId: event.target.value } })}>
                            {activeGroups.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                          </select>
                          <button className="tiny-button" aria-label={`Move ${activity.name} up`} disabled={index === 0} onClick={() => void move({ kind: "activity", item: activity, items: groupActivities, direction: -1 })}><Icon name={UI_ICONS.moveUp} /></button>
                          <button className="tiny-button" aria-label={`Move ${activity.name} down`} disabled={index === groupActivities.length - 1} onClick={() => void move({ kind: "activity", item: activity, items: groupActivities, direction: 1 })}><Icon name={UI_ICONS.moveDown} /></button>
                          <button className="tiny-button" aria-label={activity.archived ? `Restore ${activity.name}` : `Archive ${activity.name}`} onClick={() => void archive({ kind: "activity", id: activity.id, archived: activity.archived })}><Icon name={activity.archived ? UI_ICONS.restore : UI_ICONS.archive} /></button>
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
          <div className="inline-form stacked-mobile">
            <input value={activityName} onChange={(event) => setActivityName(event.target.value)} placeholder="New activity name" />
            <select value={activityGroup} onChange={(event) => setActivityGroup(event.target.value)}>{activeGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select>
            <button className="secondary-button" onClick={() => void create({ payload: { kind: "activity", name: activityName, groupId: activityGroup }, reset: () => setActivityName("") })}><Icon name={UI_ICONS.add} /> Add activity</button>
          </div>
        </section>

        <section className="settings-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Goals</p>
              <h2>{data.goals.filter((goal) => !goal.archived).length} active · {data.goals.length} total</h2>
            </div>
          </div>
          <div className="management-list">
            {data.goals.map((goal, index, all) => (
              <div className={`management-row ${goal.archived ? "archived" : ""}`} key={goal.id}>
                <span className="management-icon"><Icon name="task_alt" /></span>
                <span className="management-copy">
                  <strong>{goal.name}</strong>
                  <small>{goal.scheduleType === "daily" ? "Every day" : goal.scheduleType === "times_per_week" ? `${goal.targetPerWeek ?? 1} times this week` : "Selected days"} · {data.activities.find((activity) => activity.id === goal.activityId)?.name ?? "Unlinked"}{goal.archived ? " · archived" : ""}</small>
                </span>
                <span className="management-actions">
                  <button className="tiny-button" aria-label={`Rename ${goal.name}`} onClick={() => void rename({ kind: "goal", id: goal.id, current: goal.name })}><Icon name={UI_ICONS.edit} /></button>
                  <select className="tiny-select" aria-label={`Change activity for ${goal.name}`} value={goal.activityId} onChange={(event) => void patchCatalog({ kind: "goal", id: goal.id, patch: { activityId: event.target.value } })}>{goalActivityOptions(goal).map((activity) => <option key={activity.id} value={activity.id}>{activity.name}{activity.archived ? " (archived)" : ""}</option>)}</select>
                  <button className="tiny-button" aria-label={`Cycle schedule for ${goal.name}`} onClick={() => void cycleGoal({ goal })}><Icon name="repeat" /></button>
                  <button className="tiny-button" aria-label={`Move ${goal.name} up`} disabled={index === 0} onClick={() => void move({ kind: "goal", item: goal, items: all, direction: -1 })}><Icon name={UI_ICONS.moveUp} /></button>
                  <button className="tiny-button" aria-label={`Move ${goal.name} down`} disabled={index === all.length - 1} onClick={() => void move({ kind: "goal", item: goal, items: all, direction: 1 })}><Icon name={UI_ICONS.moveDown} /></button>
                  <button className="tiny-button" aria-label={goal.archived ? `Restore ${goal.name}` : `Archive ${goal.name}`} onClick={() => void archive({ kind: "goal", id: goal.id, archived: goal.archived })}><Icon name={goal.archived ? UI_ICONS.restore : UI_ICONS.archive} /></button>
                </span>
              </div>
            ))}
          </div>
          <div className="inline-form stacked-mobile">
            <input value={goalName} onChange={(event) => setGoalName(event.target.value)} placeholder="New goal name" />
            <select value={goalActivity} onChange={(event) => setGoalActivity(event.target.value)}>{activeActivities.map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}</select>
            <select value={goalSchedule} onChange={(event) => setGoalSchedule(event.target.value as Goal["scheduleType"])}><option value="daily">Every day</option><option value="weekdays">Selected weekdays</option><option value="times_per_week">Several times a week</option></select>
            <button className="secondary-button" onClick={() => void create({ payload: { kind: "goal", name: goalName, activityId: goalActivity, scheduleType: goalSchedule }, reset: () => setGoalName("") })}><Icon name={UI_ICONS.add} /> Add goal</button>
          </div>
        </section>

        <details className="settings-card disclosure-card">
          <summary className="disclosure-summary">
            <span>
              <p className="eyebrow">Goal-state review</p>
              <h2>{importedGoals.length} imported goals</h2>
            </span>
            <span className="management-group-meta"><span>{importedGoals.length} records</span><Icon name="expand_more" className="group-expand-icon" /></span>
          </summary>
          <p className="muted small-copy">Raw Daylio state codes are preserved. Review visibility here; the app does not silently reinterpret historical goal state.</p>
          <div className="review-list">
            {importedGoals.map((goal) => (
              <div className="review-row" key={goal.id}>
                <span><strong>{goal.name}</strong><small>Daylio raw state: {goal.sourceState}</small></span>
                <button className="secondary-button compact-button" onClick={() => void archive({ kind: "goal", id: goal.id, archived: goal.archived })}>{goal.archived ? "Show goal" : "Archive"}</button>
              </div>
            ))}
          </div>
        </details>

        <section className="settings-card export-card">
          <div>
            <p className="eyebrow">Portability</p>
            <h2>Keep a copy of your data</h2>
            <p className="muted">Download a versioned JSON export whenever you want.</p>
          </div>
          <button className="secondary-button" onClick={() => void exportData()}><Icon name={UI_ICONS.export} /> Export JSON</button>
        </section>
      </section>
      {iconPickerActivity && (
        <IconPicker
          activityName={iconPickerActivity.name}
          currentIcon={iconPickerActivity.icon}
          onClose={() => setIconPickerActivity(null)}
          onSelect={(icon) => void chooseIcon(icon)}
        />
      )}
    </>
  );
}
