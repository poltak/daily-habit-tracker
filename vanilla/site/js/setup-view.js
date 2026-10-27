import { WEEKDAY_NAMES, logicalDateFromDate, weekRangeLabel } from "../lib/daylio.js";
import { filterActivityGroups } from "../lib/activity-groups.js";
import { UI_ICONS } from "../lib/icons.js";
import { addPasskey, fetchAuthStatus, signInUrl, signOut } from "../lib/passkey-client.js";
import { acquirePendingAction, applyCatalogOverride, catalogKey, commitCatalogOverride, deleteWarning, getReorderPlan, mergeCatalogOverride, releasePendingAction, rollbackCatalogOverride, sortCatalogItems } from "../lib/catalog-mutations.js";
import { create, html, place, set, syncChildren } from "./dom.js";
import { createIconPickerSlot } from "./icon-picker.js";
import { actionIcon, icon, memo } from "./ui.js";

/** @import { Activity, ActivityGroup, Bootstrap, Goal } from "../lib/daylio.js" */
/** @import { CatalogKind, CatalogOverride, CatalogOverrides } from "../lib/catalog-mutations.js" */
/** @import { ThemePreference } from "../lib/theme.js" */
/** @import { App } from "./app.js" */
/** @typedef {{ status: "duplicate" | "patch-failed" | "saved" | "refresh-failed" }} PatchResult */

/** @type {Array<{ value: ThemePreference; label: string; description: string; icon: string }>} */
const THEME_OPTIONS = [
  { value: "system", label: "System", description: "Follow your device setting", icon: "settings_brightness" },
  { value: "light", label: "Light", description: "Keep the warm Daymark palette", icon: "light_mode" },
  { value: "dark", label: "Dark", description: "Use a softer low-light palette", icon: "dark_mode" },
];

const NO_ACTIVITIES = Symbol("no activities");

/** @param {{ overrides: CatalogOverrides; data: Bootstrap }} input */
function reconcileCatalogOverrides({ overrides, data }) {
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

/** @param {{ kind: CatalogKind; id: string }} item */
function catalogActionKey({ kind, id }) {
  return `catalog:${kind}:${id}`;
}

/** The empty icon buttons of a management row. `update` fills them. @param {string[]} actions @param {boolean} [inSummary] */
function actionButtons(actions, inSummary = false) {
  return actions.map((action) => html`<button${inSummary ? html` type="button"` : ""} class="tiny-button${action === "delete" ? " danger" : ""}" data-action="${action}"></button>`);
}

/** @param {Element} button @param {{ label: string; busy: boolean; disabled: boolean; iconName: string }} input */
function syncActionButton(button, { label, busy, disabled, iconName }) {
  set(button, { "aria-label": label, "aria-busy": busy, disabled, html: actionIcon(iconName, busy) });
}

/** @typedef {{ id: string; name: string; createdAt: number; lastUsedAt: number | null; synced: boolean; current: boolean }} Passkey */
/** @typedef {{ id: string; name: string; createdAt: number; lastUsedAt: number | null }} Connection */

/** @param {number} value */
function formatAccountDate(value) {
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** @param {string} path @param {RequestInit} [init] @returns {Promise<{ ok: boolean; body: any }>} */
async function accountRequest(path, init = {}) {
  const response = await fetch(path, { cache: "no-store", ...init });
  return { ok: response.ok, body: await response.json().catch(() => null) };
}

/** The theme, the week setting, the activity and goal catalog, the export, and the sign-in. @param {App} app */
export function createSetupView(app) {
  const { state } = app;
  const data = () => /** @type {NonNullable<typeof state.data>} */ (state.data);
  let groupName = "";
  let goalName = "";
  let activityQuery = "";
  /** @type {{ id: string; name: string; icon: string } | null} */
  let iconPickerActivity = null;
  /** @type {CatalogOverrides} */
  let catalogOverrides = {};
  /** @type {Set<string>} */
  const pendingActions = new Set();
  /** For each group, whether a filter was in use when the view last set its open state. @type {WeakMap<Element, boolean>} */
  const filterOpened = new WeakMap();
  /**
   * The passkeys and connected apps. The section shows only when passkeys protect this daymark, and not on a local server.
   * @type {{ passkeyMode: boolean; passkeys: Passkey[]; connections: Connection[] }}
   */
  const account = { passkeyMode: false, passkeys: [], connections: [] };

  /** @param {string} key */
  const isPending = (key) => pendingActions.has(key);
  /** @param {CatalogKind} kind */
  const reorderActionKey = (kind) => `reorder:${kind}`;
  /** @param {CatalogKind} kind */
  const isKindReordering = (kind) => isPending(reorderActionKey(kind));
  /** @param {{ kind: "success" | "error"; text: string }} message */
  const showMessage = (message) => app.set({ message });

  /**
   * @template T
   * @param {{ key: string; action: () => Promise<T> }} input
   */
  async function runPending({ key, action }) {
    if (!acquirePendingAction({ pending: pendingActions, key })) return undefined;
    app.set({ isSetupBusy: true });
    try {
      return await action();
    } finally {
      releasePendingAction({ pending: pendingActions, key });
      app.set({ isSetupBusy: pendingActions.size > 0 });
    }
  }

  /** @param {number} weekEndsOn */
  async function saveWeekEnd(weekEndsOn) {
    await runPending({
      key: "settings",
      action: async () => {
        try {
          const response = await fetch("/api/settings", {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ weekEndsOn }),
          });
          const result = /** @type {{ error?: string }} */ (await response.json());
          if (!response.ok) throw new Error(result.error ?? "Could not save the week setting.");
          await app.loadBootstrap();
          showMessage({ kind: "success", text: `Weeks now run ${weekRangeLabel(weekEndsOn)}.` });
        } catch (error) {
          showMessage({ kind: "error", text: /** @type {Error} */ (error).message });
        }
      },
    });
  }

  /** @param {{ payload: Record<string, unknown>; reset: () => void }} input */
  async function createItem({ payload, reset }) {
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
          const result = /** @type {{ error?: string }} */ (await response.json());
          if (!response.ok) throw new Error(result.error ?? "Could not save setup.");
          reset();
          try {
            await app.loadBootstrap();
            showMessage({ kind: "success", text: "Setup updated." });
          } catch (error) {
            showMessage({ kind: "error", text: `Created, but refresh failed; refresh the page before retrying. ${/** @type {Error} */ (error).message}` });
          }
        } catch (error) {
          showMessage({ kind: "error", text: /** @type {Error} */ (error).message });
        }
      },
    });
  }

  /**
   * @param {{ kind: CatalogKind; id: string; patch: Record<string, unknown>; optimistic?: CatalogOverride; success?: string }} input
   * @returns {Promise<PatchResult>}
   */
  async function patchCatalog({ kind, id, patch, optimistic, success = "Setup updated." }) {
    if (isPending(`reorder:${kind}`)) return { status: "duplicate" };
    const overrideKey = catalogKey({ kind, id });
    const previousOverride = catalogOverrides[overrideKey];
    const result = await runPending({
      key: catalogActionKey({ kind, id }),
      /** @returns {Promise<PatchResult>} */
      action: async () => {
        if (optimistic) catalogOverrides = applyCatalogOverride({ overrides: catalogOverrides, key: overrideKey, patch: optimistic });
        try {
          const response = await fetch(`/api/catalog/${kind}/${id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(patch),
          });
          const responseBody = /** @type {{ error?: string }} */ (await response.json());
          if (!response.ok) throw new Error(responseBody.error ?? "Could not update setup.");
        } catch (error) {
          if (optimistic) catalogOverrides = rollbackCatalogOverride({ overrides: catalogOverrides, key: overrideKey, previous: previousOverride });
          showMessage({ kind: "error", text: /** @type {Error} */ (error).message });
          return { status: "patch-failed" };
        }
        try {
          const refreshed = await app.loadBootstrap();
          catalogOverrides = reconcileCatalogOverrides({ overrides: catalogOverrides, data: refreshed });
        } catch (error) {
          showMessage({ kind: "error", text: `Saved, but setup refresh failed. The change is still shown; try refreshing again. ${/** @type {Error} */ (error).message}` });
          return { status: "refresh-failed" };
        }
        showMessage({ kind: "success", text: success });
        return { status: "saved" };
      },
    });
    return result ?? { status: "duplicate" };
  }

  /** @param {{ kind: CatalogKind; id: string; current: string }} input */
  async function rename({ kind, id, current }) {
    if (isPending(`reorder:${kind}`)) return;
    const name = window.prompt("New name", current)?.trim();
    if (name && name !== current) await patchCatalog({ kind, id, patch: { name }, optimistic: { name } });
  }

  /** @param {string} nextIcon */
  async function chooseIcon(nextIcon) {
    if (isPending("reorder:activity")) return;
    if (!iconPickerActivity || nextIcon === iconPickerActivity.icon) {
      iconPickerActivity = null;
      app.invalidate();
      return;
    }
    const result = await patchCatalog({ kind: "activity", id: iconPickerActivity.id, patch: { icon: nextIcon }, optimistic: { icon: nextIcon } });
    if (result.status === "saved" || result.status === "refresh-failed") {
      iconPickerActivity = null;
      app.invalidate();
    }
  }

  /** @param {{ kind: CatalogKind; item: { id: string; sortOrder: number }; items: Array<{ id: string; sortOrder: number }>; direction: -1 | 1 }} input */
  async function move({ kind, item, items, direction }) {
    const plan = getReorderPlan({ items, itemId: item.id, direction });
    if (!plan) return;
    if (isPending(`reorder:${kind}`) || plan.updates.some(({ id }) => isPending(catalogActionKey({ kind, id })))) return;
    const previousOverrides = catalogOverrides;

    await runPending({
      key: reorderActionKey(kind),
      action: async () => {
        for (const update of plan.updates) catalogOverrides = applyCatalogOverride({ overrides: catalogOverrides, key: catalogKey({ kind, id: update.id }), patch: { sortOrder: update.sortOrder } });
        try {
          const response = await fetch("/api/catalog/reorder", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ kind, updates: plan.updates }),
          });
          const result = /** @type {{ error?: string }} */ (await response.json());
          if (!response.ok) throw new Error(result.error ?? "Could not reorder setup.");
        } catch (error) {
          for (const update of plan.updates) {
            const key = catalogKey({ kind, id: update.id });
            catalogOverrides = rollbackCatalogOverride({ overrides: catalogOverrides, key, previous: previousOverrides[key] });
          }
          showMessage({ kind: "error", text: /** @type {Error} */ (error).message });
          return;
        }
        try {
          const refreshed = await app.loadBootstrap();
          catalogOverrides = reconcileCatalogOverrides({ overrides: catalogOverrides, data: refreshed });
          showMessage({ kind: "success", text: "Setup updated." });
        } catch (error) {
          showMessage({ kind: "error", text: `Reorder saved, but setup refresh failed. The change is still shown; try refreshing again. ${/** @type {Error} */ (error).message}` });
        }
      },
    });
  }

  /** @param {{ kind: CatalogKind; id: string; archived: boolean }} input */
  async function archive({ kind, id, archived }) {
    const nextArchived = !archived;
    await patchCatalog({ kind, id, patch: { archived: nextArchived }, optimistic: { archived: nextArchived }, success: nextArchived ? "Archived." : "Restored." });
  }

  /** @param {{ kind: CatalogKind; id: string; name: string }} input */
  async function remove({ kind, id, name }) {
    if (isPending(reorderActionKey(kind)) || isPending(catalogActionKey({ kind, id }))) return;
    const activityCount = kind === "group" ? data().activities.filter((activity) => activity.groupId === id).length : 0;
    if (!window.confirm(deleteWarning({ kind, name, activityCount }))) return;
    await runPending({
      key: catalogActionKey({ kind, id }),
      action: async () => {
        try {
          const response = await fetch(`/api/catalog/${kind}/${id}`, { method: "DELETE" });
          const result = /** @type {{ error?: string }} */ (await response.json());
          if (!response.ok) throw new Error(result.error ?? "Could not delete that item.");
        } catch (error) {
          showMessage({ kind: "error", text: /** @type {Error} */ (error).message });
          return;
        }
        try {
          await app.loadBootstrap();
          showMessage({ kind: "success", text: "Deleted." });
        } catch (error) {
          showMessage({ kind: "error", text: `Deleted, but setup refresh failed; refresh the page. ${/** @type {Error} */ (error).message}` });
        }
      },
    });
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
          showMessage({ kind: "success", text: "Export downloaded." });
        } catch (error) {
          showMessage({ kind: "error", text: /** @type {Error} */ (error).message });
        }
      },
    });
  }

  async function refreshAccount() {
    try {
      const status = await fetchAuthStatus();
      if (status.mode !== "passkey") return;
      const [passkeys, connections] = await Promise.all([accountRequest("/api/auth/passkeys"), accountRequest("/api/auth/connections")]);
      if (!passkeys.ok || !connections.ok) throw new Error("The sign-in settings could not be loaded.");
      Object.assign(account, { passkeyMode: true, passkeys: passkeys.body.passkeys, connections: connections.body.connections });
    } catch (error) {
      showMessage({ kind: "error", text: /** @type {Error} */ (error).message });
    }
    app.invalidate();
  }

  async function addAccountPasskey() {
    await runPending({
      key: "account",
      action: async () => {
        const result = await addPasskey();
        if (!result.ok) {
          showMessage({ kind: "error", text: result.message });
          return;
        }
        showMessage({ kind: "success", text: "Passkey added." });
        await refreshAccount();
      },
    });
  }

  /** @param {Passkey} passkey */
  async function removePasskey(passkey) {
    const warning = passkey.current
      ? `Remove the passkey "${passkey.name}"? You signed in with it, so this device signs out.`
      : `Remove the passkey "${passkey.name}"? Devices that signed in with it sign out.`;
    if (!window.confirm(warning)) return;
    await runPending({
      key: "account",
      action: async () => {
        const result = await accountRequest(`/api/auth/passkeys/${encodeURIComponent(passkey.id)}`, { method: "DELETE" }).catch(() => null);
        if (!result?.ok) {
          showMessage({ kind: "error", text: result?.body?.error ?? "The passkey could not be removed." });
          return;
        }
        if (result.body.signedOut) {
          window.location.replace(signInUrl("/?view=settings"));
          return;
        }
        showMessage({ kind: "success", text: "Passkey removed." });
        await refreshAccount();
      },
    });
  }

  /** @param {Connection} connection */
  async function disconnect(connection) {
    if (!window.confirm(`Disconnect ${connection.name}? It stops working until you connect it again.`)) return;
    await runPending({
      key: "account",
      action: async () => {
        const result = await accountRequest(`/api/auth/connections/${encodeURIComponent(connection.id)}`, { method: "DELETE" }).catch(() => null);
        if (!result?.ok) {
          showMessage({ kind: "error", text: result?.body?.error ?? "The app could not be disconnected." });
          return;
        }
        showMessage({ kind: "success", text: `${connection.name} disconnected.` });
        await refreshAccount();
      },
    });
  }

  async function signOutHere() {
    await runPending({
      key: "account",
      action: async () => {
        await signOut();
        window.location.replace(signInUrl("/"));
      },
    });
  }

  const page = create(html`
    <section class="page-section settings-page">
      <div class="page-intro">
        <p class="eyebrow">Your setup</p>
        <h1>Make it yours</h1>
        <p class="muted">Your space, your routines. Set up a journal that feels like you.</p>
      </div>

      <section class="settings-card appearance-card">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Appearance</p>
            <h2>Choose your theme</h2>
            <p class="muted small-copy">System follows your device. Your choice is saved on this device.</p>
          </div>
        </div>
        <div class="theme-options" role="radiogroup" aria-label="Appearance theme">
          ${THEME_OPTIONS.map((option) => html`
            <label class="theme-option">
              <input type="radio" name="theme-preference" value="${option.value}" data-action="theme">
              <span class="theme-preview theme-preview-${option.value}" aria-hidden="true"><i></i><i></i><i></i></span>
              <span class="theme-option-content">
                <span class="theme-option-icon">${icon(option.icon)}</span>
                <span class="theme-option-copy"><strong>${option.label}</strong><small>${option.description}</small></span>
                <span class="theme-option-check">${icon(UI_ICONS.check)}</span>
              </span>
            </label>`)}
        </div>
      </section>

      <section class="settings-card week-card">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Week</p>
            <h2>Choose when your week ends</h2>
            <p class="muted small-copy"></p>
          </div>
        </div>
        <label class="goal-config-field week-end-field">
          <span>Week ends on</span>
          <select data-action="week-end">${WEEKDAY_NAMES.map((name, weekday) => html`<option value="${weekday}">${name}</option>`)}</select>
        </label>
      </section>

      <section class="settings-card activities-card">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Activities</p>
            <h2></h2>
          </div>
        </div>
        <label class="search-field">
          ${icon(UI_ICONS.search)}
          <input placeholder="Filter activities to manage" aria-label="Filter activities to manage" data-action="activity-filter">
        </label>
        <div class="management-groups"></div>
        <div class="inline-form">
          <input placeholder="New group name" data-action="group-name">
          <button class="secondary-button" data-action="create-group"></button>
        </div>
      </section>

      <section class="settings-card goals-card">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Goals</p>
            <h2></h2>
          </div>
        </div>
        <div class="management-list"></div>
        <div class="inline-form stacked-mobile">
          <input placeholder="New goal name" data-action="goal-name">
          <button class="secondary-button" data-action="create-goal"></button>
        </div>
        <p class="muted small-copy">New goals start with a daily schedule and no associated activity. Use Configure to set their repeat, icon, and activity.</p>
      </section>

      <section class="settings-card export-card">
        <div>
          <p class="eyebrow">Portability</p>
          <h2>Keep a copy of your data</h2>
          <p class="muted">Download a versioned JSON export whenever you want.</p>
        </div>
        <button class="secondary-button" data-action="export"></button>
      </section>

      <section class="settings-card account-card" hidden>
        <div class="section-heading">
          <div>
            <p class="eyebrow">Sign-in</p>
            <h2>Passkeys and connected apps</h2>
            <p class="muted small-copy">A passkey signs you in with your face, fingerprint or screen lock. Add one on each device that you use.</p>
          </div>
        </div>
        <h3 class="account-subheading">Passkeys</h3>
        <ul class="account-list passkey-list"></ul>
        <div class="account-actions">
          <button class="secondary-button" data-action="add-passkey"></button>
          <button class="secondary-button" data-action="sign-out">${icon("logout")} Sign out</button>
        </div>
        <h3 class="account-subheading">Connected apps</h3>
        <p class="muted small-copy account-empty">No apps are connected. An MCP client such as Claude Code shows here after you allow it.</p>
        <ul class="account-list connection-list"></ul>
      </section>
    </section>`);
  /** @param {string} selector @returns {any} */
  const find = (selector) => page.querySelector(selector);
  const themeOptions = /** @type {HTMLLabelElement[]} */ ([...page.querySelectorAll(".theme-option")]);
  const weekCard = find(".week-card");
  const weekCopy = find(".week-card .small-copy");
  const weekSelect = find('[data-action="week-end"]');
  const activitiesCard = find(".activities-card");
  const activitiesTitle = find(".activities-card h2");
  const filterInput = find('[data-action="activity-filter"]');
  const groupList = find(".management-groups");
  const groupForm = find(".activities-card .inline-form");
  const [groupNameInput, createGroupButton] = groupForm.children;
  const goalsTitle = find(".goals-card h2");
  const goalList = find(".goals-card .management-list");
  const [goalNameInput, createGoalButton] = find(".goals-card .inline-form").children;
  const exportButton = find('[data-action="export"]');
  const accountCard = find(".account-card");
  const passkeyList = find(".passkey-list");
  const connectionList = find(".connection-list");
  const connectionsEmpty = find(".account-empty");
  const addPasskeyButton = find('[data-action="add-passkey"]');
  const signOutButton = find('[data-action="sign-out"]');
  const noMatches = create(html`<p class="empty-inline">No activities match that filter.</p>`);
  // The React app gives these two cards the settings-card class only. The extra names above are for the queries.
  activitiesCard.className = "settings-card";
  find(".goals-card").className = "settings-card";

  const iconPicker = createIconPickerSlot({
    parent: () => /** @type {Node} */ (page.parentNode),
    onClose: () => {
      iconPickerActivity = null;
      app.invalidate();
    },
    onSelect: (nextIcon) => void chooseIcon(nextIcon),
  });

  const effectiveGroupsMemo = memo();
  const effectiveActivitiesMemo = memo();
  const effectiveGoalsMemo = memo();
  const groupedActivitiesMemo = memo();

  /** The catalog with the changes that are not saved yet, as the lists that the view shows. */
  function catalog() {
    const { groups, activities, goals } = data();
    /** @type {ActivityGroup[]} */
    const effectiveGroups = effectiveGroupsMemo([catalogOverrides, groups], () => sortCatalogItems({ items: groups.map((group) => mergeCatalogOverride({ record: group, overrides: catalogOverrides, key: catalogKey({ kind: "group", id: group.id }) })) }));
    /** @type {Activity[]} */
    const effectiveActivities = effectiveActivitiesMemo([catalogOverrides, activities], () => sortCatalogItems({ items: activities.map((activity) => mergeCatalogOverride({ record: activity, overrides: catalogOverrides, key: catalogKey({ kind: "activity", id: activity.id }) })) }));
    /** @type {Goal[]} */
    const effectiveGoals = effectiveGoalsMemo([catalogOverrides, goals], () => sortCatalogItems({ items: goals.map((goal) => mergeCatalogOverride({ record: goal, overrides: catalogOverrides, key: catalogKey({ kind: "goal", id: goal.id }) })) }));
    const query = activityQuery.trim();
    const groupedActivities = groupedActivitiesMemo([effectiveActivities, effectiveGroups, query], () => filterActivityGroups({ groups: effectiveGroups, activities: effectiveActivities, query, includeArchived: true, includeEmpty: !query }));
    return { effectiveGroups, effectiveActivities, effectiveGoals, query, groupedActivities };
  }

  function update() {
    const { effectiveGroups, effectiveActivities, effectiveGoals, query, groupedActivities } = catalog();
    const activeGroups = effectiveGroups.filter((group) => !group.archived);
    const activeActivities = effectiveActivities.filter((activity) => !activity.archived);
    const weekEndsOn = data().settings.weekEndsOn;

    for (const option of themeOptions) {
      const input = /** @type {HTMLInputElement} */ (option.firstElementChild);
      const selected = state.themePreference === input.value;
      set(option, { class: `theme-option ${selected ? "selected" : ""}` });
      set(input, { checked: selected });
    }

    set(weekCard, { "aria-busy": isPending("settings") });
    set(weekCopy, { text: `Weekly goal results, weekly insights, and calendars run ${weekRangeLabel(weekEndsOn)}. This applies on every device.` });
    set(weekSelect, { value: String(weekEndsOn), disabled: isPending("settings") });

    set(activitiesTitle, { text: `${activeActivities.length} active activities in ${activeGroups.length} ${activeGroups.length === 1 ? "group" : "groups"}` });
    set(filterInput, { value: activityQuery });
    const groupReordering = isKindReordering("group");
    const activityReordering = isKindReordering("activity");
    const groupOptions = html`${activeGroups.map((candidate) => html`<option value="${candidate.id}">${candidate.name}</option>`)}`;
    syncChildren({
      parent: groupList,
      items: groupedActivities,
      key: ({ group }) => group.id,
      create: () => create(html`
        <details data-kind="group">
          <summary>
            <span class="management-copy"><strong></strong><small></small></span>
            <span class="management-group-meta">
              <span class="management-actions" data-action="group-actions">${actionButtons(["rename", "move-up", "move-down", "archive", "delete"], true)}</span>
            </span>
            ${icon("expand_more", "group-expand-icon")}
          </summary>
          <div class="management-list"></div>
        </details>`),
      update: (details, { group, activities, activeCount, archivedCount }, groupIndex) => {
        const [summary, list] = details.children;
        const [copy, meta] = summary.children;
        const [renameButton, upButton, downButton, archiveButton, deleteButton] = meta.children[0].children;
        const groupPending = isPending(catalogActionKey({ kind: "group", id: group.id })) || groupReordering;
        const updating = `Updating ${group.name}…`;
        set(details, { class: group.archived ? "archived" : null, "data-id": group.id });
        // A filter opens each group, and the end of a filter closes each group. In between, the person's choice stays.
        if (filterOpened.get(details) !== Boolean(query)) {
          details.open = Boolean(query);
          filterOpened.set(details, Boolean(query));
        }
        set(copy.children[0], { text: group.name });
        set(copy.children[1], { text: `${activeCount} active${archivedCount ? ` · ${archivedCount} archived` : ""}${group.archived ? " · group archived" : ""}` });
        syncActionButton(renameButton, { label: groupPending ? updating : `Rename ${group.name}`, busy: groupPending, disabled: groupPending, iconName: UI_ICONS.edit });
        syncActionButton(upButton, { label: groupReordering ? updating : `Move ${group.name} up`, busy: groupReordering, disabled: groupIndex === 0 || groupPending, iconName: UI_ICONS.moveUp });
        syncActionButton(downButton, { label: groupReordering ? updating : `Move ${group.name} down`, busy: groupReordering, disabled: groupIndex === groupedActivities.length - 1 || groupPending, iconName: UI_ICONS.moveDown });
        syncActionButton(archiveButton, { label: groupPending ? updating : group.archived ? `Restore ${group.name}` : `Archive ${group.name}`, busy: groupPending, disabled: groupPending, iconName: group.archived ? UI_ICONS.restore : UI_ICONS.archive });
        syncActionButton(deleteButton, { label: groupPending ? updating : `Delete ${group.name}`, busy: groupPending, disabled: groupPending, iconName: UI_ICONS.delete });
        const addButton = meta.children[1];
        if (!group.archived && !addButton) meta.appendChild(create(html`<button type="button" class="add-activity-button" data-action="add-activity">+ Add new</button>`));
        else if (group.archived && addButton) addButton.remove();
        if (!group.archived) set(meta.children[1], { "aria-label": `Add new activity to ${group.name}` });

        /** @type {Array<Activity | typeof NO_ACTIVITIES>} */
        const rows = activities.length ? activities : [NO_ACTIVITIES];
        syncChildren({
          parent: list,
          items: rows,
          key: (activity) => activity === NO_ACTIVITIES ? "" : `activity:${activity.id}`,
          create: (activity) => activity === NO_ACTIVITIES
            ? create(html`<p class="empty-inline">No activities in this group.</p>`)
            : create(html`
              <div data-kind="activity">
                <span class="management-icon"></span>
                <span class="management-copy"><strong></strong><small></small></span>
                <select data-action="move-to-group"></select>
                <span class="management-actions">${actionButtons(["rename", "choose-icon", "move-up", "move-down", "archive", "delete"])}</span>
              </div>`),
          update: (row, activity, index) => {
            if (activity === NO_ACTIVITIES) return;
            const [rowIcon, rowCopy, select, actions] = row.children;
            const [rename, chooseIconButton, up, down, archiveRow, deleteRow] = actions.children;
            const archived = activity.archived;
            const pending = isPending(catalogActionKey({ kind: "activity", id: activity.id })) || activityReordering;
            const updatingRow = `Updating ${activity.name}…`;
            set(row, { class: `management-row ${archived ? "archived" : ""}`, "data-id": activity.id });
            set(rowIcon, { html: icon(activity.icon) });
            set(rowCopy.children[0], { text: activity.name });
            set(rowCopy.children[1], { text: `${activity.icon}${archived ? " · archived" : ""}` });
            set(select, { class: `tiny-select ${pending ? "pending-action" : ""}`, "aria-label": `Move ${activity.name} to group`, "aria-busy": pending, disabled: pending, html: groupOptions, value: activity.groupId });
            syncActionButton(rename, { label: pending ? updatingRow : `Rename ${activity.name}`, busy: pending, disabled: pending, iconName: UI_ICONS.edit });
            syncActionButton(chooseIconButton, { label: pending ? updatingRow : `Choose icon for ${activity.name}`, busy: pending, disabled: pending, iconName: "palette" });
            syncActionButton(up, { label: activityReordering ? updatingRow : `Move ${activity.name} up`, busy: activityReordering, disabled: index === 0 || activityReordering || pending, iconName: UI_ICONS.moveUp });
            syncActionButton(down, { label: activityReordering ? updatingRow : `Move ${activity.name} down`, busy: activityReordering, disabled: index === activities.length - 1 || activityReordering || pending, iconName: UI_ICONS.moveDown });
            syncActionButton(archiveRow, { label: pending ? updatingRow : archived ? `Restore ${activity.name}` : `Archive ${activity.name}`, busy: pending, disabled: pending, iconName: archived ? UI_ICONS.restore : UI_ICONS.archive });
            syncActionButton(deleteRow, { label: pending ? updatingRow : `Delete ${activity.name}`, busy: pending, disabled: pending, iconName: UI_ICONS.delete });
          },
        });
      },
    });
    place({ node: noMatches, present: Boolean(query) && !groupedActivities.length, parent: activitiesCard, before: groupForm });
    const groupFormBusy = groupReordering || isPending("create:group");
    set(groupNameInput, { value: groupName, "aria-busy": groupFormBusy, disabled: groupFormBusy });
    set(createGroupButton, { "aria-busy": groupFormBusy, disabled: groupFormBusy, html: html`${actionIcon(UI_ICONS.add, groupFormBusy)} ${isPending("create:group") ? "Adding…" : groupReordering ? "Reordering…" : "Add group"}` });

    const goalReordering = isKindReordering("goal");
    set(goalsTitle, { text: `${effectiveGoals.filter((goal) => !goal.archived).length} active · ${effectiveGoals.length} total` });
    syncChildren({
      parent: goalList,
      items: effectiveGoals,
      key: (goal) => goal.id,
      create: () => create(html`
        <div data-kind="goal">
          <span class="management-icon"></span>
          <span class="management-copy"><strong></strong><small></small></span>
          <span class="management-actions">${actionButtons(["configure-goal", "move-up", "move-down", "archive", "delete"])}</span>
        </div>`),
      update: (row, goal, index) => {
        const [rowIcon, rowCopy, actions] = row.children;
        const [configure, up, down, archiveRow, deleteRow] = actions.children;
        const archived = goal.archived;
        const pending = isPending(catalogActionKey({ kind: "goal", id: goal.id })) || goalReordering;
        const updatingRow = `Updating ${goal.name}…`;
        const schedule = goal.repeatType === "weekly" || goal.scheduleType === "times_per_week"
          ? `${goal.targetPerWeek ?? 1} ${goal.targetPerWeek === 1 ? "day" : "days"} per week`
          : goal.weekdaysMask && goal.weekdaysMask !== 127 ? "Selected weekdays" : "Every day";
        set(row, { class: `management-row ${archived ? "archived" : ""}`, "data-id": goal.id });
        set(rowIcon, { html: icon(goal.materialIcon) });
        set(rowCopy.children[0], { text: goal.name });
        set(rowCopy.children[1], { text: `${schedule} · ${effectiveActivities.find((activity) => activity.id === goal.activityId)?.name ?? "No associated activity"}${archived ? " · archived" : ""}` });
        syncActionButton(configure, { label: pending ? updatingRow : `Configure ${goal.name}`, busy: pending, disabled: pending, iconName: UI_ICONS.edit });
        syncActionButton(up, { label: goalReordering ? updatingRow : `Move ${goal.name} up`, busy: goalReordering, disabled: index === 0 || goalReordering || pending, iconName: UI_ICONS.moveUp });
        syncActionButton(down, { label: goalReordering ? updatingRow : `Move ${goal.name} down`, busy: goalReordering, disabled: index === effectiveGoals.length - 1 || goalReordering || pending, iconName: UI_ICONS.moveDown });
        syncActionButton(archiveRow, { label: pending ? updatingRow : archived ? `Restore ${goal.name}` : `Archive ${goal.name}`, busy: pending, disabled: pending, iconName: archived ? UI_ICONS.restore : UI_ICONS.archive });
        syncActionButton(deleteRow, { label: pending ? updatingRow : `Delete ${goal.name}`, busy: pending, disabled: pending, iconName: UI_ICONS.delete });
      },
    });
    const goalFormBusy = goalReordering || isPending("create:goal");
    set(goalNameInput, { value: goalName, "aria-busy": goalFormBusy, disabled: goalFormBusy });
    set(createGoalButton, { "aria-busy": goalFormBusy, disabled: goalFormBusy, html: html`${actionIcon(UI_ICONS.add, goalFormBusy)} ${isPending("create:goal") ? "Adding…" : goalReordering ? "Reordering…" : "Add goal"}` });

    set(exportButton, { "aria-busy": isPending("export"), disabled: isPending("export"), html: html`${actionIcon(UI_ICONS.export, isPending("export"))} ${isPending("export") ? "Exporting…" : "Export JSON"}` });

    const accountBusy = isPending("account");
    set(accountCard, { hidden: !account.passkeyMode });
    const onlyPasskey = account.passkeys.length <= 1;
    syncChildren({
      parent: passkeyList,
      items: account.passkeys,
      key: (passkey) => passkey.id,
      create: () => create(html`<li><span class="management-copy"><strong></strong><small></small></span><button class="secondary-button" data-action="remove-passkey">Remove</button></li>`),
      update: (row, passkey) => {
        set(row, { "data-id": passkey.id });
        set(row.querySelector("strong"), { text: passkey.current ? `${passkey.name} · this device` : passkey.name });
        const used = passkey.lastUsedAt ? `Last used ${formatAccountDate(passkey.lastUsedAt)}` : "Not used to sign in yet";
        set(row.querySelector("small"), { text: `Added ${formatAccountDate(passkey.createdAt)} · ${used}${passkey.synced ? " · Synced" : ""}` });
        set(row.querySelector("button"), {
          disabled: accountBusy || onlyPasskey,
          title: onlyPasskey ? "Add another passkey before you remove this one." : null,
          "aria-label": `Remove passkey ${passkey.name}`,
        });
      },
    });
    syncChildren({
      parent: connectionList,
      items: account.connections,
      key: (connection) => connection.id,
      create: () => create(html`<li><span class="management-copy"><strong></strong><small></small></span><button class="secondary-button" data-action="disconnect">Disconnect</button></li>`),
      update: (row, connection) => {
        set(row, { "data-id": connection.id });
        set(row.querySelector("strong"), { text: connection.name });
        set(row.querySelector("small"), { text: `Connected ${formatAccountDate(connection.createdAt)} · ${connection.lastUsedAt ? `Last used ${formatAccountDate(connection.lastUsedAt)}` : "Not used yet"}` });
        set(row.querySelector("button"), { disabled: accountBusy, "aria-label": `Disconnect ${connection.name}` });
      },
    });
    set(connectionsEmpty, { hidden: account.connections.length > 0 });
    set(addPasskeyButton, { "aria-busy": accountBusy, disabled: accountBusy, html: html`${actionIcon("passkey", accountBusy)} Add a passkey on this device` });
    set(signOutButton, { disabled: accountBusy });

    iconPicker.update(iconPickerActivity ? {
      activityName: iconPickerActivity.name,
      currentIcon: iconPickerActivity.icon,
      isSaving: isPending(catalogActionKey({ kind: "activity", id: iconPickerActivity.id })) || activityReordering,
    } : null);
  }

  /**
   * The catalog item of the row that holds `element`, with the list that the row shows in.
   * @param {Element} element
   * @returns {{ kind: CatalogKind; item: ActivityGroup | Activity | Goal; items: Array<ActivityGroup | Activity | Goal> } | null}
   */
  function itemFor(element) {
    const row = /** @type {HTMLElement | null} */ (element.closest("[data-kind]"));
    if (!row) return null;
    const { kind, id } = row.dataset;
    const { effectiveGoals, groupedActivities } = catalog();
    const items = kind === "group"
      ? groupedActivities.map((visible) => visible.group)
      : kind === "activity"
        ? groupedActivities.find((visible) => visible.activities.some((activity) => activity.id === id))?.activities ?? []
        : effectiveGoals;
    const item = items.find((candidate) => candidate.id === id);
    return item ? { kind: /** @type {CatalogKind} */ (kind), item, items } : null;
  }

  /**
   * A click on a group action must not open or close the group.
   * @param {(element: HTMLElement, event: Event) => void} handler
   */
  const inSummary = (handler) => (/** @type {HTMLElement} */ element, /** @type {Event} */ event) => {
    if (element.closest("summary")) event.preventDefault();
    handler(element, event);
  };

  void refreshAccount();

  return {
    nodes: [page],
    update,
    destroy: () => {
      iconPicker.update(null);
      app.set({ isSetupBusy: false });
    },
    handlers: {
      click: {
        rename: inSummary((button) => {
          const target = itemFor(button);
          if (target) void rename({ kind: target.kind, id: target.item.id, current: target.item.name });
        }),
        "move-up": inSummary((button) => {
          const target = itemFor(button);
          if (target) void move({ ...target, direction: -1 });
        }),
        "move-down": inSummary((button) => {
          const target = itemFor(button);
          if (target) void move({ ...target, direction: 1 });
        }),
        archive: inSummary((button) => {
          const target = itemFor(button);
          if (target) void archive({ kind: target.kind, id: target.item.id, archived: target.item.archived });
        }),
        delete: inSummary((button) => {
          const target = itemFor(button);
          if (target) void remove({ kind: target.kind, id: target.item.id, name: target.item.name });
        }),
        // A click between the group action buttons does nothing.
        "group-actions": inSummary(() => undefined),
        "choose-icon": (/** @type {HTMLElement} */ button) => {
          const target = itemFor(button);
          if (!target) return;
          iconPickerActivity = { id: target.item.id, name: target.item.name, icon: /** @type {Activity} */ (target.item).icon };
          app.invalidate();
        },
        "configure-goal": (/** @type {HTMLElement} */ button) => {
          const target = itemFor(button);
          if (target) app.openGoal(target.item.id);
        },
        "add-activity": inSummary((button) => {
          const target = itemFor(button);
          if (target) app.changeView("add-activity", { groupId: target.item.id, returnView: "settings" });
        }),
        "create-group": () => void createItem({
          payload: { kind: "group", name: groupName },
          reset: () => {
            groupName = "";
            app.invalidate();
          },
        }),
        "create-goal": () => void createItem({
          payload: { kind: "goal", name: goalName, startDate: logicalDateFromDate() },
          reset: () => {
            goalName = "";
            app.invalidate();
          },
        }),
        export: () => void exportData(),
        "add-passkey": () => void addAccountPasskey(),
        "sign-out": () => void signOutHere(),
        "remove-passkey": (/** @type {HTMLElement} */ button) => {
          const passkey = account.passkeys.find((candidate) => candidate.id === button.closest("li")?.dataset.id);
          if (passkey) void removePasskey(passkey);
        },
        disconnect: (/** @type {HTMLElement} */ button) => {
          const connection = account.connections.find((candidate) => candidate.id === button.closest("li")?.dataset.id);
          if (connection) void disconnect(connection);
        },
      },
      input: {
        "activity-filter": (/** @type {HTMLInputElement} */ input) => {
          activityQuery = input.value;
          app.invalidate();
        },
        "group-name": (/** @type {HTMLInputElement} */ input) => {
          groupName = input.value;
        },
        "goal-name": (/** @type {HTMLInputElement} */ input) => {
          goalName = input.value;
        },
      },
      change: {
        theme: (/** @type {HTMLInputElement} */ input) => app.updateThemePreference(/** @type {ThemePreference} */ (input.value)),
        "week-end": (/** @type {HTMLSelectElement} */ select) => void saveWeekEnd(Number(select.value)),
        "move-to-group": (/** @type {HTMLSelectElement} */ select) => {
          const target = itemFor(select);
          if (target) void patchCatalog({ kind: "activity", id: target.item.id, patch: { groupId: select.value }, optimistic: { groupId: select.value } });
        },
      },
    },
  };
}
