"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Bootstrap } from "../../lib/daylio";
import { filterActivityGroups } from "../../lib/activity-groups";
import { ACTIVITY_ICON_CHOICES, UI_ICONS } from "../../lib/icons";
import { applyTheme, THEME_MEDIA_QUERY, THEME_STORAGE_KEY, readStoredThemePreference, type ThemePreference } from "../../lib/theme";
import { acquirePendingAction, applyCatalogOverride, catalogKey, commitCatalogOverride, getReorderPlan, mergeCatalogOverride, releasePendingAction, rollbackCatalogOverride, sortCatalogItems, type CatalogKind, type CatalogOverride, type CatalogOverrides } from "../../lib/catalog-mutations";
import { Icon } from "./icon";

type SetupMessage = { kind: "success" | "error"; text: string };
type PatchResult = { status: "duplicate" | "patch-failed" | "saved" | "refresh-failed" };

export type SetupViewProps = {
  data: Bootstrap;
  onRefresh: () => Promise<Bootstrap>;
  onMessage: (message: SetupMessage) => void;
  onBusyChange: (busy: boolean) => void;
  onOpenGoal: (goalId: string) => void;
  onOpenAddActivity: (groupId: string) => void;
};

function usePendingActions({ onBusyChange }: { onBusyChange: (busy: boolean) => void }) {
  const [pendingActions, setPendingActions] = useState<Record<string, boolean>>({});
  const pendingActionRef = useRef<Set<string>>(new Set());
  const isPending = useCallback((key: string) => Boolean(pendingActions[key]) || pendingActionRef.current.has(key), [pendingActions]);
  const runPending = useCallback(
    async function runPending<T>({ key, action }: { key: string; action: () => Promise<T> }) {
      if (pendingActions[key] || pendingActionRef.current.has(key)) return undefined;
      if (!acquirePendingAction({ pending: pendingActionRef.current, key })) return undefined;
      onBusyChange(true);
      setPendingActions((current) => ({ ...current, [key]: true }));
      try {
        return await action();
      } finally {
        releasePendingAction({ pending: pendingActionRef.current, key });
        onBusyChange(pendingActionRef.current.size > 0);
        setPendingActions((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
      }
    },
    [onBusyChange, pendingActions],
  );

  useEffect(() => () => onBusyChange(false), [onBusyChange]);

  return { isPending, runPending };
}

function reconcileCatalogOverrides({ overrides, data }: { overrides: CatalogOverrides; data: Bootstrap }) {
  let next = overrides;
  for (const [key, patch] of Object.entries(overrides)) {
    const [kind, id] = key.split(":");
    if (kind !== "group" && kind !== "activity" && kind !== "goal") continue;
    const record = kind === "group"
      ? data.groups.find((candidate) => candidate.id === id)
      : kind === "activity"
        ? data.activities.find((candidate) => candidate.id === id)
        : data.goals.find((candidate) => candidate.id === id);
    if (record) next = commitCatalogOverride({ overrides: next, key, record, patch });
  }
  return next;
}

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string; description: string; icon: string }> = [
  { value: "system", label: "System", description: "Follow your device setting", icon: "settings_brightness" },
  { value: "light", label: "Light", description: "Keep the warm Daymark palette", icon: "light_mode" },
  { value: "dark", label: "Dark", description: "Use a softer low-light palette", icon: "dark_mode" },
];

function iconLabel(name: string) {
  return name.replaceAll("_", " ");
}

export function IconPicker({
  activityName,
  itemType = "Activity",
  currentIcon,
  isSaving,
  onClose,
  onSelect,
}: {
  activityName: string;
  itemType?: "Activity" | "Goal";
  currentIcon: string;
  isSaving: boolean;
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
            <p className="eyebrow">{itemType} icon</p>
            <h2 id="icon-picker-title">Choose an icon</h2>
            <p className="muted">For {activityName}</p>
          </div>
          <button className="icon-button" aria-label="Close icon picker" onClick={onClose} disabled={isSaving}>
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
            <button key={item} className={category === item ? "selected" : ""} aria-pressed={category === item} onClick={() => setCategory(item)} disabled={isSaving}>
              {item}
            </button>
          ))}
        </div>
        <p className="icon-picker-count" role={isSaving ? "status" : undefined}>{isSaving ? "Saving icon…" : `${choices.length} icons`}</p>
        {choices.length ? (
          <div className="icon-picker-grid" aria-label="Available icons">
            {choices.map((choice) => (
              <button
                key={choice.name}
                className={`icon-choice ${currentIcon === choice.name ? "selected" : ""}`}
                aria-label={isSaving ? "Saving icon…" : `Use ${iconLabel(choice.name)} icon`}
                aria-pressed={currentIcon === choice.name}
                onClick={() => onSelect(choice.name)}
                disabled={isSaving}
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

export function SetupView({ data, onRefresh, onMessage, onBusyChange, onOpenGoal, onOpenAddActivity }: SetupViewProps) {
  const [groupName, setGroupName] = useState("");
  const [goalName, setGoalName] = useState("");
  const [activityQuery, setActivityQuery] = useState("");
  const [iconPickerActivity, setIconPickerActivity] = useState<{ id: string; name: string; icon: string } | null>(null);
  const [themePreference, setThemePreference] = useState<ThemePreference>("system");
  const { isPending, runPending } = usePendingActions({ onBusyChange });
  const [catalogOverrides, setCatalogOverrides] = useState<CatalogOverrides>({});

  function catalogActionKey({ kind, id }: { kind: CatalogKind; id: string }) {
    return `catalog:${kind}:${id}`;
  }

  function reorderActionKey(kind: CatalogKind) {
    return `reorder:${kind}`;
  }

  function isKindReordering(kind: CatalogKind) {
    return isPending(reorderActionKey(kind));
  }

  function isCatalogPending({ kind, id }: { kind: CatalogKind; id: string }) {
    return isPending(catalogActionKey({ kind, id })) || isKindReordering(kind);
  }

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
    const kind = typeof payload.kind === "string" ? payload.kind : "catalog";
    if (kind === "group" || kind === "activity" || kind === "goal") {
      if (isPending(`reorder:${kind}`)) return;
    }
    await runPending({
      key: `create:${kind}`,
      action: async () => {
        try {
          const response = await fetch("/api/catalog", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });
          const result = (await response.json()) as { error?: string };
          if (!response.ok) throw new Error(result.error ?? "Could not save setup.");
          reset();
          try {
            await onRefresh();
            onMessage({ kind: "success", text: "Setup updated." });
          } catch (error) {
            onMessage({ kind: "error", text: `Created, but refresh failed; refresh the page before retrying. ${(error as Error).message}` });
          }
        } catch (error) {
          onMessage({ kind: "error", text: (error as Error).message });
        }
      },
    });
  }

  async function patchCatalog({
    kind,
    id,
    patch,
    optimistic,
    success = "Setup updated.",
  }: {
    kind: CatalogKind;
    id: string;
    patch: Record<string, unknown>;
    optimistic?: CatalogOverride;
    success?: string;
  }) {
    if (isPending(`reorder:${kind}`)) return { status: "duplicate" } satisfies PatchResult;
    const overrideKey = catalogKey({ kind, id });
    const previousOverride = catalogOverrides[overrideKey];
    const result = await runPending({
      key: catalogActionKey({ kind, id }),
      action: async () => {
        if (optimistic) setCatalogOverrides((current) => applyCatalogOverride({ overrides: current, key: overrideKey, patch: optimistic }));
        try {
          const response = await fetch(`/api/catalog/${kind}/${id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(patch),
          });
          const responseBody = (await response.json()) as { error?: string };
          if (!response.ok) throw new Error(responseBody.error ?? "Could not update setup.");
        } catch (error) {
          if (optimistic) setCatalogOverrides((current) => rollbackCatalogOverride({ overrides: current, key: overrideKey, previous: previousOverride }));
          onMessage({ kind: "error", text: (error as Error).message });
          return { status: "patch-failed" } satisfies PatchResult;
        }
        try {
          const refreshed = await onRefresh();
          setCatalogOverrides((current) => reconcileCatalogOverrides({ overrides: current, data: refreshed }));
        } catch (error) {
          onMessage({ kind: "error", text: `Saved, but setup refresh failed. The change is still shown; try refreshing again. ${(error as Error).message}` });
          return { status: "refresh-failed" } satisfies PatchResult;
        }
        onMessage({ kind: "success", text: success });
        return { status: "saved" } satisfies PatchResult;
      },
    });
    return result ?? { status: "duplicate" };
  }

  async function rename({ kind, id, current }: { kind: CatalogKind; id: string; current: string }) {
    if (isPending(`reorder:${kind}`)) return;
    const name = window.prompt("New name", current)?.trim();
    if (name && name !== current) await patchCatalog({ kind, id, patch: { name }, optimistic: { name } });
  }

  async function chooseIcon(icon: string) {
    if (isPending("reorder:activity")) return;
    if (!iconPickerActivity || icon === iconPickerActivity.icon) {
      setIconPickerActivity(null);
      return;
    }

    const result = await patchCatalog({ kind: "activity", id: iconPickerActivity.id, patch: { icon }, optimistic: { icon } });
    if (result.status === "saved" || result.status === "refresh-failed") setIconPickerActivity(null);
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
    const plan = getReorderPlan({ items, itemId: item.id, direction });
    if (!plan) return;
    const itemKey = catalogKey({ kind, id: plan.item.id });
    const swapKey = catalogKey({ kind, id: plan.swap.id });
    if (isPending(`reorder:${kind}`) || isPending(catalogActionKey({ kind, id: plan.item.id })) || isPending(catalogActionKey({ kind, id: plan.swap.id }))) return;
    const previousItemOverride = catalogOverrides[itemKey];
    const previousSwapOverride = catalogOverrides[swapKey];

    await runPending({
      key: reorderActionKey(kind),
      action: async () => {
        setCatalogOverrides((current) => {
          let next = applyCatalogOverride({ overrides: current, key: itemKey, patch: { sortOrder: plan.swap.sortOrder } });
          next = applyCatalogOverride({ overrides: next, key: swapKey, patch: { sortOrder: plan.item.sortOrder } });
          return next;
        });

        const settled = await Promise.allSettled(
          plan.updates.map((update) => fetch(`/api/catalog/${kind}/${update.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sortOrder: update.sortOrder }),
          })),
        );
        const successfulUpdates = plan.updates.filter((_, index) => {
          const result = settled[index];
          return result?.status === "fulfilled" && result.value.ok;
        });

        if (successfulUpdates.length === plan.updates.length) {
          try {
            const refreshed = await onRefresh();
            setCatalogOverrides((current) => reconcileCatalogOverrides({ overrides: current, data: refreshed }));
            onMessage({ kind: "success", text: "Setup updated." });
          } catch (error) {
            onMessage({ kind: "error", text: `Reorder saved, but setup refresh failed. The change is still shown; try refreshing again. ${(error as Error).message}` });
          }
          return;
        }

        const compensationUpdates = plan.compensation.filter((compensation) => successfulUpdates.some((update) => update.id === compensation.id));
        const compensationResults = await Promise.allSettled(
          compensationUpdates.map((update) => fetch(`/api/catalog/${kind}/${update.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sortOrder: update.sortOrder }),
          })),
        );
        const compensationFailed = compensationResults.some((result) => result.status === "rejected" || !result.value.ok);
        setCatalogOverrides((current) => {
          let next = rollbackCatalogOverride({ overrides: current, key: itemKey, previous: previousItemOverride });
          next = rollbackCatalogOverride({ overrides: next, key: swapKey, previous: previousSwapOverride });
          return next;
        });

        let refreshError: Error | null = null;
        try {
          const refreshed = await onRefresh();
          setCatalogOverrides((current) => reconcileCatalogOverrides({ overrides: current, data: refreshed }));
        } catch (error) {
          refreshError = error as Error;
        }
        const details = compensationFailed ? " Some changes could not be compensated." : "";
        const refreshDetails = refreshError ? ` Refresh also failed: ${refreshError.message}` : "";
        onMessage({ kind: "error", text: `Could not reorder setup.${details}${refreshDetails}` });
      },
    });
  }

  async function archive({ kind, id, archived }: { kind: CatalogKind; id: string; archived: boolean }) {
    const nextArchived = !archived;
    await patchCatalog({ kind, id, patch: { archived: nextArchived }, optimistic: { archived: nextArchived }, success: nextArchived ? "Archived." : "Restored." });
  }

  async function exportData() {
    await runPending({
      key: "export",
      action: async () => {
        try {
          const response = await fetch("/api/export");
          if (!response.ok) throw new Error("Could not export your data.");

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
        } catch (error) {
          onMessage({ kind: "error", text: (error as Error).message });
        }
      },
    });
  }

  const effectiveGroups = useMemo(
    () => sortCatalogItems({ items: data.groups.map((group) => mergeCatalogOverride({ record: group, overrides: catalogOverrides, key: catalogKey({ kind: "group", id: group.id }) })) }),
    [catalogOverrides, data.groups],
  );
  const effectiveActivities = useMemo(
    () => sortCatalogItems({ items: data.activities.map((activity) => mergeCatalogOverride({ record: activity, overrides: catalogOverrides, key: catalogKey({ kind: "activity", id: activity.id }) })) }),
    [catalogOverrides, data.activities],
  );
  const effectiveGoals = useMemo(
    () => sortCatalogItems({ items: data.goals.map((goal) => mergeCatalogOverride({ record: goal, overrides: catalogOverrides, key: catalogKey({ kind: "goal", id: goal.id }) })) }),
    [catalogOverrides, data.goals],
  );
  const activeGroups = effectiveGroups.filter((group) => !group.archived);
  const activeActivities = effectiveActivities.filter((activity) => !activity.archived);
  const importedGoals = effectiveGoals.filter((goal) => goal.sourceState !== undefined);
  const query = activityQuery.trim();
  const groupedActivities = useMemo(
    () => filterActivityGroups({ groups: effectiveGroups, activities: effectiveActivities, query, includeArchived: true }),
    [effectiveActivities, effectiveGroups, query],
  );

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
            {effectiveGroups.map((group, index, all) => {
              const archived = group.archived;
              const actionKey = catalogActionKey({ kind: "group", id: group.id });
              const reordering = isKindReordering("group");
              const pending = isPending(actionKey) || reordering;
              return <div className={`management-row ${archived ? "archived" : ""}`} key={group.id}>
                <span className="management-icon"><Icon name="folder" /></span>
                <span className="management-copy">
                  <strong>{group.name}</strong>
                  <small>{effectiveActivities.filter((activity) => activity.groupId === group.id && !activity.archived).length} active activities{archived ? " · archived" : ""}</small>
                </span>
                <span className="management-actions">
                  <button className={`tiny-button ${pending ? "pending-action" : ""}`} aria-label={pending ? `Updating ${group.name}…` : `Rename ${group.name}`} aria-busy={pending} disabled={pending} onClick={() => void rename({ kind: "group", id: group.id, current: group.name })}><Icon name={pending ? UI_ICONS.sync : UI_ICONS.edit} /></button>
                  <button className={`tiny-button ${reordering ? "pending-action" : ""}`} aria-label={reordering ? `Updating ${group.name}…` : `Move ${group.name} up`} aria-busy={reordering} disabled={index === 0 || reordering || pending} onClick={() => void move({ kind: "group", item: group, items: all, direction: -1 })}><Icon name={reordering ? UI_ICONS.sync : UI_ICONS.moveUp} /></button>
                  <button className={`tiny-button ${reordering ? "pending-action" : ""}`} aria-label={reordering ? `Updating ${group.name}…` : `Move ${group.name} down`} aria-busy={reordering} disabled={index === all.length - 1 || reordering || pending} onClick={() => void move({ kind: "group", item: group, items: all, direction: 1 })}><Icon name={reordering ? UI_ICONS.sync : UI_ICONS.moveDown} /></button>
                  <button className={`tiny-button ${pending ? "pending-action" : ""}`} aria-label={pending ? `Updating ${group.name}…` : archived ? `Restore ${group.name}` : `Archive ${group.name}`} aria-busy={pending} disabled={pending} onClick={() => void archive({ kind: "group", id: group.id, archived })}><Icon name={pending ? UI_ICONS.sync : archived ? UI_ICONS.restore : UI_ICONS.archive} /></button>
                </span>
              </div>;
            })}
          </div>
          <div className="inline-form">
            <input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="New group name" aria-busy={isKindReordering("group") || isPending("create:group")} disabled={isKindReordering("group") || isPending("create:group")} />
            <button className={`secondary-button ${isKindReordering("group") || isPending("create:group") ? "pending-action" : ""}`} aria-busy={isKindReordering("group") || isPending("create:group")} disabled={isKindReordering("group") || isPending("create:group")} onClick={() => void create({ payload: { kind: "group", name: groupName }, reset: () => setGroupName("") })}><Icon name={isPending("create:group") ? UI_ICONS.sync : UI_ICONS.add} /> {isPending("create:group") ? "Adding…" : isKindReordering("group") ? "Reordering…" : "Add group"}</button>
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
                    <span className="management-group-meta">
                      <span>{totalLabel}</span>
                      {!group.archived && (
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
                      )}
                      <Icon name="expand_more" className="group-expand-icon" />
                    </span>
                  </summary>
                  <div className="management-list">
                    {activities.map((activity, index, groupActivities) => (
                      (() => {
                        const archived = activity.archived;
                        const actionKey = catalogActionKey({ kind: "activity", id: activity.id });
                        const reordering = isKindReordering("activity");
                        const pending = isPending(actionKey) || reordering;
                        return <div className={`management-row ${archived ? "archived" : ""}`} key={activity.id}>
                        <span className="management-icon"><Icon name={activity.icon} /></span>
                        <span className="management-copy">
                          <strong>{activity.name}</strong>
                          <small>{activity.icon}{archived ? " · archived" : ""}</small>
                        </span>
                        <span className="management-actions">
                          <button className={`tiny-button ${pending ? "pending-action" : ""}`} aria-label={pending ? `Updating ${activity.name}…` : `Rename ${activity.name}`} aria-busy={pending} disabled={pending} onClick={() => void rename({ kind: "activity", id: activity.id, current: activity.name })}><Icon name={pending ? UI_ICONS.sync : UI_ICONS.edit} /></button>
                          <button className={`tiny-button ${pending ? "pending-action" : ""}`} aria-label={pending ? `Updating ${activity.name}…` : `Choose icon for ${activity.name}`} aria-busy={pending} disabled={pending} onClick={() => setIconPickerActivity({ id: activity.id, name: activity.name, icon: activity.icon })}><Icon name={pending ? UI_ICONS.sync : "palette"} /></button>
                          <select className={`tiny-select ${pending ? "pending-action" : ""}`} aria-label={`Move ${activity.name} to group`} aria-busy={pending} disabled={pending} value={activity.groupId} onChange={(event) => void patchCatalog({ kind: "activity", id: activity.id, patch: { groupId: event.target.value }, optimistic: { groupId: event.target.value } })}>
                            {activeGroups.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
                          </select>
                          <button className={`tiny-button ${reordering ? "pending-action" : ""}`} aria-label={reordering ? `Updating ${activity.name}…` : `Move ${activity.name} up`} aria-busy={reordering} disabled={index === 0 || reordering || pending} onClick={() => void move({ kind: "activity", item: activity, items: groupActivities, direction: -1 })}><Icon name={reordering ? UI_ICONS.sync : UI_ICONS.moveUp} /></button>
                          <button className={`tiny-button ${reordering ? "pending-action" : ""}`} aria-label={reordering ? `Updating ${activity.name}…` : `Move ${activity.name} down`} aria-busy={reordering} disabled={index === groupActivities.length - 1 || reordering || pending} onClick={() => void move({ kind: "activity", item: activity, items: groupActivities, direction: 1 })}><Icon name={reordering ? UI_ICONS.sync : UI_ICONS.moveDown} /></button>
                          <button className={`tiny-button ${pending ? "pending-action" : ""}`} aria-label={pending ? `Updating ${activity.name}…` : archived ? `Restore ${activity.name}` : `Archive ${activity.name}`} aria-busy={pending} disabled={pending} onClick={() => void archive({ kind: "activity", id: activity.id, archived })}><Icon name={pending ? UI_ICONS.sync : archived ? UI_ICONS.restore : UI_ICONS.archive} /></button>
                        </span>
                        </div>;
                      })()
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        </section>

        <section className="settings-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Goals</p>
              <h2>{effectiveGoals.filter((goal) => !goal.archived).length} active · {effectiveGoals.length} total</h2>
            </div>
          </div>
          <div className="management-list">
            {effectiveGoals.map((goal, index, all) => {
              const archived = goal.archived;
              const actionKey = catalogActionKey({ kind: "goal", id: goal.id });
              const reordering = isKindReordering("goal");
              const pending = isPending(actionKey) || reordering;
              return <div className={`management-row ${archived ? "archived" : ""}`} key={goal.id}>
                <span className="management-icon"><Icon name={goal.materialIcon} /></span>
                <span className="management-copy">
                  <strong>{goal.name}</strong>
                  <small>{goal.repeatType === "weekly" || goal.scheduleType === "times_per_week" ? `${goal.targetPerWeek ?? 1} ${goal.targetPerWeek === 1 ? "day" : "days"} per week` : goal.weekdaysMask && goal.weekdaysMask !== 127 ? "Selected weekdays" : "Every day"} · {effectiveActivities.find((activity) => activity.id === goal.activityId)?.name ?? "No associated activity"}{archived ? " · archived" : ""}</small>
                </span>
                <span className="management-actions">
                  <button className={`tiny-button ${pending ? "pending-action" : ""}`} aria-label={pending ? `Updating ${goal.name}…` : `Configure ${goal.name}`} aria-busy={pending} disabled={pending} onClick={() => onOpenGoal(goal.id)}><Icon name={pending ? UI_ICONS.sync : UI_ICONS.edit} /></button>
                  <button className={`tiny-button ${reordering ? "pending-action" : ""}`} aria-label={reordering ? `Updating ${goal.name}…` : `Move ${goal.name} up`} aria-busy={reordering} disabled={index === 0 || reordering || pending} onClick={() => void move({ kind: "goal", item: goal, items: all, direction: -1 })}><Icon name={reordering ? UI_ICONS.sync : UI_ICONS.moveUp} /></button>
                  <button className={`tiny-button ${reordering ? "pending-action" : ""}`} aria-label={reordering ? `Updating ${goal.name}…` : `Move ${goal.name} down`} aria-busy={reordering} disabled={index === all.length - 1 || reordering || pending} onClick={() => void move({ kind: "goal", item: goal, items: all, direction: 1 })}><Icon name={reordering ? UI_ICONS.sync : UI_ICONS.moveDown} /></button>
                  <button className={`tiny-button ${pending ? "pending-action" : ""}`} aria-label={pending ? `Updating ${goal.name}…` : archived ? `Restore ${goal.name}` : `Archive ${goal.name}`} aria-busy={pending} disabled={pending} onClick={() => void archive({ kind: "goal", id: goal.id, archived })}><Icon name={pending ? UI_ICONS.sync : archived ? UI_ICONS.restore : UI_ICONS.archive} /></button>
                </span>
              </div>;
            })}
          </div>
          <div className="inline-form stacked-mobile">
            <input value={goalName} onChange={(event) => setGoalName(event.target.value)} placeholder="New goal name" aria-busy={isKindReordering("goal") || isPending("create:goal")} disabled={isKindReordering("goal") || isPending("create:goal")} />
            <button className={`secondary-button ${isKindReordering("goal") || isPending("create:goal") ? "pending-action" : ""}`} aria-busy={isKindReordering("goal") || isPending("create:goal")} disabled={isKindReordering("goal") || isPending("create:goal")} onClick={() => void create({ payload: { kind: "goal", name: goalName }, reset: () => setGoalName("") })}><Icon name={isPending("create:goal") ? UI_ICONS.sync : UI_ICONS.add} /> {isPending("create:goal") ? "Adding…" : isKindReordering("goal") ? "Reordering…" : "Add goal"}</button>
          </div>
          <p className="muted small-copy">New goals start with a daily schedule and no associated activity. Use Configure to set their repeat, icon, and activity.</p>
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
            {importedGoals.map((goal) => {
              const archived = goal.archived;
              const pending = isCatalogPending({ kind: "goal", id: goal.id });
              return <div className="review-row" key={goal.id}>
                <span><strong>{goal.name}</strong><small>Daylio raw state: {goal.sourceState}</small></span>
                <button className={`secondary-button compact-button ${pending ? "pending-action" : ""}`} aria-busy={pending} disabled={pending} onClick={() => void archive({ kind: "goal", id: goal.id, archived })}>{pending ? "Updating…" : archived ? "Show goal" : "Archive"}</button>
              </div>;
            })}
          </div>
        </details>

        <section className="settings-card export-card">
          <div>
            <p className="eyebrow">Portability</p>
            <h2>Keep a copy of your data</h2>
            <p className="muted">Download a versioned JSON export whenever you want.</p>
          </div>
          <button className={`secondary-button ${isPending("export") ? "pending-action" : ""}`} aria-busy={isPending("export")} disabled={isPending("export")} onClick={() => void exportData()}><Icon name={isPending("export") ? UI_ICONS.sync : UI_ICONS.export} /> {isPending("export") ? "Exporting…" : "Export JSON"}</button>
        </section>
      </section>
      {iconPickerActivity && (
        <IconPicker
          activityName={iconPickerActivity.name}
          currentIcon={iconPickerActivity.icon}
          isSaving={isPending(catalogActionKey({ kind: "activity", id: iconPickerActivity.id })) || isKindReordering("activity")}
          onClose={() => setIconPickerActivity(null)}
          onSelect={(icon) => void chooseIcon(icon)}
        />
      )}
    </>
  );
}
