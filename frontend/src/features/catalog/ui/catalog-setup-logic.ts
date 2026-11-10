import { Logic, type TaskState } from "@app/common/features/core/logic/logic";
import { logicalDateInTimeZone } from "@app/common/features/core/utils/logical-date";
import type {
  Activity,
  ActivityGroup,
  CatalogKind,
  Goal,
} from "@app/common/features/catalog/types";
import type { FrontendLogicProps } from "../../core/logic/types.js";
import { failureMessage } from "../../core/logic/failure-message.js";
import type { App } from "../../core/types.js";
import type { Notice } from "../../days/types.js";
import {
  actionKey,
  applyCatalogOverride,
  catalogKey,
  commitCatalogOverrides,
  deleteWarning,
  getReorderPlan,
  reorderKey,
  rollbackCatalogOverride,
  type CatalogOverride,
  type CatalogOverrides,
} from "../utils/catalog-mutations.js";
import {
  CatalogRequestsPlugin,
  type ItemPatch,
} from "./catalog-requests-plugin.js";

type SetupProps = FrontendLogicProps<never, "clock" | "dialogs", "catalog"> &
  Pick<App, "catalogEvents">;

/** The activity whose icon the dialog changes. */
export interface IconTarget {
  id: string;
  name: string;
  icon: string;
}

interface SetupState {
  groups: ActivityGroup[];
  activities: Activity[];
  goals: Goal[];
  /** Changes that the page shows before the server confirms them. */
  overrides: CatalogOverrides;
  /** The changes that run now. A second change of the same item waits for the first. */
  pendingKeys: string[];
  notice: Notice | null;
  activityQuery: string;
  /** The groups that the owner opened. A filter opens every group it finds. */
  openGroupIds: string[];
  newGroupName: string;
  newGoalName: string;
  iconTarget: IconTarget | null;
  loadCatalogState: TaskState;
  loadCatalogError: string | null;
}

type PatchStatus = "duplicate" | "patch-failed" | "saved" | "refresh-failed";

/**
 * The groups, activities and goals on the Setup page: create, rename, move,
 * archive and delete. A change shows at once and is rolled back when the
 * server refuses it. The app owns one for the whole session, so a page that
 * ends a change elsewhere can leave a notice for the Setup page.
 */
export class CatalogSetupLogic extends Logic<
  SetupProps,
  SetupState,
  never,
  { requests: CatalogRequestsPlugin }
> {
  constructor(deps: SetupProps) {
    super({
      deps,
      plugins: {
        requests: (pluginDeps) => new CatalogRequestsPlugin(pluginDeps),
      },
      initialState: {
        groups: [],
        activities: [],
        goals: [],
        overrides: {},
        pendingKeys: [],
        notice: null,
        activityQuery: "",
        openGroupIds: [],
        newGroupName: "",
        newGoalName: "",
        iconTarget: null,
        loadCatalogState: "pristine",
        loadCatalogError: null,
      },
    });
  }

  protected override async onInitialize(): Promise<void> {
    this.listen(this.deps.catalogEvents, (event) => {
      if (event.notice?.target === "settings") {
        this.show({ kind: "success", text: event.notice.text });
      }
    });
  }

  /** Read the catalog again. True when it is loaded. */
  async load(): Promise<boolean> {
    await this.executeTask("loadCatalog", async () => {
      const catalog = await this.plugins.requests.read();
      const records = new Map<string, object>([
        ...catalog.groups.map(
          (group) =>
            [catalogKey({ kind: "group", id: group.id }), group] as const,
        ),
        ...catalog.activities.map(
          (activity) =>
            [
              catalogKey({ kind: "activity", id: activity.id }),
              activity,
            ] as const,
        ),
        ...catalog.goals.map(
          (goal) => [catalogKey({ kind: "goal", id: goal.id }), goal] as const,
        ),
      ]);
      this.setState({
        groups: catalog.groups,
        activities: catalog.activities,
        goals: catalog.goals,
        overrides: commitCatalogOverrides({
          overrides: this.state.overrides,
          records,
        }),
      });
    });
    return this.state.loadCatalogState === "success";
  }

  isPending(key: string): boolean {
    return this.state.pendingKeys.includes(key);
  }

  clearNotice(): void {
    this.setState({ notice: null });
  }

  setActivityQuery({ query }: { query: string }): void {
    // The end of a filter closes every group.
    const filterEnded =
      query.trim() === "" && this.state.activityQuery.trim() !== "";
    this.setState({
      activityQuery: query,
      ...(filterEnded ? { openGroupIds: [] } : {}),
    });
  }

  setGroupOpen({ groupId, open }: { groupId: string; open: boolean }): void {
    const others = this.state.openGroupIds.filter((id) => id !== groupId);
    this.setState({ openGroupIds: open ? [...others, groupId] : others });
  }

  setNewGroupName({ name }: { name: string }): void {
    this.setState({ newGroupName: name });
  }

  setNewGoalName({ name }: { name: string }): void {
    this.setState({ newGoalName: name });
  }

  openIconPicker({ target }: { target: IconTarget }): void {
    this.setState({ iconTarget: target });
  }

  closeIconPicker(): void {
    this.setState({ iconTarget: null });
  }

  async createGroup(): Promise<void> {
    await this.createItem({
      kind: "group",
      send: () =>
        this.plugins.requests.createGroup({ name: this.state.newGroupName }),
      reset: () => this.setState({ newGroupName: "" }),
    });
  }

  async createGoal(): Promise<void> {
    const { clock } = this.deps.services;
    await this.createItem({
      kind: "goal",
      send: () =>
        this.plugins.requests.createGoal({
          name: this.state.newGoalName,
          startDate: logicalDateInTimeZone({
            now: clock.now(),
            timeZone: clock.timeZone(),
          }),
        }),
      reset: () => this.setState({ newGoalName: "" }),
    });
  }

  /** Ask for a new name, and rename the group or the activity when the owner gives one. */
  async rename({
    kind,
    id,
    current,
  }: {
    kind: "group" | "activity";
    id: string;
    current: string;
  }): Promise<void> {
    if (this.isPending(reorderKey(kind))) {
      return;
    }
    const name = this.deps.services.dialogs.prompt("New name", current)?.trim();
    if (name && name !== current) {
      await this.patchItem({ kind, id, patch: { name }, optimistic: { name } });
    }
  }

  async moveToGroup({
    id,
    groupId,
  }: {
    id: string;
    groupId: string;
  }): Promise<void> {
    await this.patchItem({
      kind: "activity",
      id,
      patch: { groupId },
      optimistic: { groupId },
    });
  }

  async archive({
    kind,
    id,
    archived,
  }: {
    kind: CatalogKind;
    id: string;
    archived: boolean;
  }): Promise<void> {
    const next = !archived;
    await this.patchItem({
      kind,
      id,
      patch: { archived: next },
      optimistic: { archived: next },
      success: next ? "Archived." : "Restored.",
    });
  }

  /** Change the icon of the activity in the dialog, and close the dialog when the change is stored. */
  async chooseIcon({ icon }: { icon: string }): Promise<void> {
    const { iconTarget } = this.state;
    if (this.isPending(reorderKey("activity"))) {
      return;
    }
    if (!iconTarget || icon === iconTarget.icon) {
      this.setState({ iconTarget: null });
      return;
    }
    const status = await this.patchItem({
      kind: "activity",
      id: iconTarget.id,
      patch: { icon },
      optimistic: { icon },
    });
    if (status === "saved" || status === "refresh-failed") {
      this.setState({ iconTarget: null });
    }
  }

  /** Move an item a step in the list that shows it. */
  async move({
    kind,
    itemId,
    items,
    direction,
  }: {
    kind: CatalogKind;
    itemId: string;
    items: Array<{ id: string; sortOrder: number }>;
    direction: -1 | 1;
  }): Promise<void> {
    const plan = getReorderPlan({ items, itemId, direction });
    if (
      !plan ||
      this.isPending(reorderKey(kind)) ||
      plan.updates.some(({ id }) => this.isPending(actionKey({ kind, id })))
    ) {
      return;
    }
    const before = this.state.overrides;
    await this.runPending({
      key: reorderKey(kind),
      action: async () => {
        let overrides = this.state.overrides;
        for (const update of plan.updates) {
          overrides = applyCatalogOverride({
            overrides,
            key: catalogKey({ kind, id: update.id }),
            patch: { sortOrder: update.sortOrder },
          });
        }
        this.setState({ overrides });
        try {
          await this.plugins.requests.reorder({ kind, updates: plan.updates });
        } catch (error) {
          let rolledBack = this.state.overrides;
          for (const update of plan.updates) {
            const key = catalogKey({ kind, id: update.id });
            rolledBack = rollbackCatalogOverride({
              overrides: rolledBack,
              key,
              previous: before[key],
            });
          }
          this.setState({ overrides: rolledBack });
          this.show({ kind: "error", text: failureMessage(error) });
          return;
        }
        this.deps.catalogEvents.emitDetached({ type: "catalogChanged" });
        if (await this.load()) {
          this.show({ kind: "success", text: "Setup updated." });
        } else {
          this.show({
            kind: "error",
            text: `Reorder saved, but setup refresh failed. The change is still shown; try refreshing again. ${this.state.loadCatalogError}`,
          });
        }
      },
    });
  }

  /** Delete an item after the owner reads the warning. */
  async remove({
    kind,
    id,
    name,
  }: {
    kind: CatalogKind;
    id: string;
    name: string;
  }): Promise<void> {
    if (
      this.isPending(reorderKey(kind)) ||
      this.isPending(actionKey({ kind, id }))
    ) {
      return;
    }
    const activityCount =
      kind === "group"
        ? this.state.activities.filter((activity) => activity.groupId === id)
            .length
        : 0;
    if (
      !this.deps.services.dialogs.confirm(
        deleteWarning({ kind, name, activityCount }),
      )
    ) {
      return;
    }
    await this.runPending({
      key: actionKey({ kind, id }),
      action: async () => {
        try {
          await this.plugins.requests.remove({ kind, id });
        } catch (error) {
          this.show({ kind: "error", text: failureMessage(error) });
          return;
        }
        this.deps.catalogEvents.emitDetached({ type: "catalogChanged" });
        if (await this.load()) {
          this.show({ kind: "success", text: "Deleted." });
        } else {
          this.show({
            kind: "error",
            text: `Deleted, but setup refresh failed; refresh the page. ${this.state.loadCatalogError}`,
          });
        }
      },
    });
  }

  private show(notice: Notice): void {
    this.setState({ notice });
  }

  private async runPending<Result>({
    key,
    action,
  }: {
    key: string;
    action: () => Promise<Result>;
  }): Promise<Result | undefined> {
    if (this.isPending(key)) {
      return undefined;
    }
    this.setState({ pendingKeys: [...this.state.pendingKeys, key] });
    try {
      return await action();
    } finally {
      this.setState({
        pendingKeys: this.state.pendingKeys.filter(
          (pending) => pending !== key,
        ),
      });
    }
  }

  private async createItem({
    kind,
    send,
    reset,
  }: {
    kind: "group" | "goal";
    send: () => Promise<unknown>;
    reset: () => void;
  }): Promise<void> {
    if (this.isPending(reorderKey(kind))) {
      return;
    }
    await this.runPending({
      key: `create:${kind}`,
      action: async () => {
        try {
          await send();
        } catch (error) {
          this.show({ kind: "error", text: failureMessage(error) });
          return;
        }
        reset();
        this.deps.catalogEvents.emitDetached({ type: "catalogChanged" });
        if (await this.load()) {
          this.show({ kind: "success", text: "Setup updated." });
        } else {
          this.show({
            kind: "error",
            text: `Created, but refresh failed; refresh the page before retrying. ${this.state.loadCatalogError}`,
          });
        }
      },
    });
  }

  /** Send one change. The page shows `optimistic` until the server answers. */
  private async patchItem({
    kind,
    id,
    patch,
    optimistic,
    success = "Setup updated.",
  }: {
    kind: CatalogKind;
    id: string;
    patch: ItemPatch;
    optimistic: CatalogOverride;
    success?: string;
  }): Promise<PatchStatus> {
    if (this.isPending(reorderKey(kind))) {
      return "duplicate";
    }
    const key = catalogKey({ kind, id });
    const previous = this.state.overrides[key];
    const status = await this.runPending<PatchStatus>({
      key: actionKey({ kind, id }),
      action: async () => {
        this.setState({
          overrides: applyCatalogOverride({
            overrides: this.state.overrides,
            key,
            patch: optimistic,
          }),
        });
        try {
          if (kind === "goal") {
            await this.plugins.requests.patchGoal({ id, patch });
          } else {
            await this.plugins.requests.patch({ kind, id, patch });
          }
        } catch (error) {
          this.setState({
            overrides: rollbackCatalogOverride({
              overrides: this.state.overrides,
              key,
              previous,
            }),
          });
          this.show({ kind: "error", text: failureMessage(error) });
          return "patch-failed";
        }
        this.deps.catalogEvents.emitDetached({ type: "catalogChanged" });
        if (!(await this.load())) {
          this.show({
            kind: "error",
            text: `Saved, but setup refresh failed. The change is still shown; try refreshing again. ${this.state.loadCatalogError}`,
          });
          return "refresh-failed";
        }
        this.show({ kind: "success", text: success });
        return "saved";
      },
    });
    return status ?? "duplicate";
  }
}
