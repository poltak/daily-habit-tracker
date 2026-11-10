import { LogicPlugin } from "@app/common/features/core/logic/logic-plugin";
import type {
  Activity,
  ActivityGroup,
  Catalog,
  CatalogKind,
  Goal,
  SortOrderUpdate,
} from "@app/common/features/catalog/types";
import { requireApiSuccess } from "../../api/client/api-client.js";
import type { FrontendLogicProps } from "../../core/logic/types.js";

export type CatalogRequestsProps = FrontendLogicProps<never, never, "catalog">;

/** The fields that a change of a group or an activity can carry. */
export interface ItemPatch {
  name?: string;
  archived?: boolean;
  groupId?: string;
  icon?: string;
}

/** What a change of a goal carries. */
export interface GoalPatch {
  name?: string;
  activityId?: string | null;
  materialIcon?: string;
  repeatType?: "daily" | "weekly";
  scheduleType?: "daily" | "weekdays" | "times_per_week";
  targetPerWeek?: number | null;
  weekdaysMask?: number | null;
  archived?: boolean;
}

/**
 * The requests of `/api/catalog`. A failed request throws, with the text that
 * the owner reads, so the Logic that calls decides what the page says.
 */
export class CatalogRequestsPlugin extends LogicPlugin<
  CatalogRequestsProps,
  Record<string, never>
> {
  constructor(deps: CatalogRequestsProps) {
    super({ deps, initialState: {} });
  }

  async read(): Promise<Catalog> {
    const response = await this.deps.api.catalog.$get(undefined, {
      init: { signal: this.signal },
    });
    await requireApiSuccess(response);
    if (response.status !== 200) {
      throw new Error("Could not connect to your journal.");
    }
    return response.json();
  }

  async createGroup({ name }: { name: string }): Promise<ActivityGroup> {
    const response = await this.deps.api.catalog.$post({
      json: { kind: "group", name },
    });
    await requireApiSuccess(response);
    return ((await response.json()) as { group: ActivityGroup }).group;
  }

  async createActivity({
    name,
    groupId,
    icon,
  }: {
    name: string;
    groupId: string;
    icon: string;
  }): Promise<Activity> {
    const response = await this.deps.api.catalog.$post({
      json: { kind: "activity", name, groupId, icon },
    });
    await requireApiSuccess(response);
    return ((await response.json()) as { activity: Activity }).activity;
  }

  async createGoal({
    name,
    startDate,
  }: {
    name: string;
    startDate: string;
  }): Promise<Goal> {
    const response = await this.deps.api.catalog.$post({
      json: { kind: "goal", name, startDate },
    });
    await requireApiSuccess(response);
    return ((await response.json()) as { goal: Goal }).goal;
  }

  /** Change a group or an activity. */
  async patch({
    kind,
    id,
    patch,
  }: {
    kind: "group" | "activity";
    id: string;
    patch: ItemPatch;
  }): Promise<void> {
    const { catalog } = this.deps.api;
    const response =
      kind === "group"
        ? await catalog.group[":id"].$patch({
            param: { id },
            json: {
              ...(patch.name === undefined ? {} : { name: patch.name }),
              ...(patch.archived === undefined
                ? {}
                : { archived: patch.archived }),
            },
          })
        : await catalog.activity[":id"].$patch({
            param: { id },
            json: patch,
          });
    await requireApiSuccess(response);
  }

  async patchGoal({
    id,
    patch,
  }: {
    id: string;
    patch: GoalPatch;
  }): Promise<Goal> {
    const response = await this.deps.api.catalog.goal[":id"].$patch({
      param: { id },
      json: patch,
    });
    await requireApiSuccess(response);
    return ((await response.json()) as { goal: Goal }).goal;
  }

  async remove({ kind, id }: { kind: CatalogKind; id: string }): Promise<void> {
    const { catalog } = this.deps.api;
    const param = { param: { id } };
    const response =
      kind === "group"
        ? await catalog.group[":id"].$delete(param)
        : kind === "activity"
          ? await catalog.activity[":id"].$delete(param)
          : await catalog.goal[":id"].$delete(param);
    await requireApiSuccess(response);
  }

  async reorder({
    kind,
    updates,
  }: {
    kind: CatalogKind;
    updates: SortOrderUpdate[];
  }): Promise<void> {
    const response = await this.deps.api.catalog.reorder.$post({
      json: { kind, updates },
    });
    await requireApiSuccess(response);
  }
}
