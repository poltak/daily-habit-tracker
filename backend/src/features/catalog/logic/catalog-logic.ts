import { Logic } from "@app/common/features/core/logic/logic";
import type {
  Activity,
  ActivityGroup,
  Catalog,
  CatalogKind,
  Goal,
  SortOrderUpdate,
} from "@app/common/features/catalog/types";
import { isActivityIcon } from "@app/common/features/catalog/utils/activity-icons";
import { iconForActivity } from "@app/common/features/catalog/utils/activity-icon";
import { normalizeGoalConfig } from "@app/common/features/catalog/utils/goal-config";
import { isLogicalDate } from "@app/common/features/core/utils/logical-date";
import { AppError } from "../../core/errors/app-error.js";
import type {
  BackendAtomicProps,
  BackendLogicProps,
} from "../../core/logic/types.js";
import type { GoalRow } from "../storage/types.js";
import type {
  ActivityPatch,
  GoalCreate,
  GoalPatch,
  GroupPatch,
} from "../utils/catalog-input.js";
import {
  DEFAULT_GOAL_ICON,
  toActivity,
  toGoal,
  toGroup,
  toMood,
} from "../utils/catalog-rows.js";

type CatalogProps = BackendLogicProps<"catalog", "clock"> & BackendAtomicProps;

/** The name of a goal that was added with no name. */
const UNNAMED_GOAL = "Activity goal";

function invalid(message: string): AppError {
  return new AppError({ code: "INVALID_REQUEST", message });
}

function missing<Row>(row: Row | undefined, message: string): Row {
  if (row === undefined) {
    throw invalid(message);
  }
  return row;
}

/** The schedule of a goal after a patch. The row fills in what the patch leaves out. */
function currentGoalConfig(current: GoalRow, patch: GoalPatch) {
  const storedRepeat =
    current.repeatType === "weekly" || current.scheduleType === "times_per_week"
      ? "weekly"
      : "daily";
  return normalizeGoalConfig({
    repeatType:
      patch.repeatType ??
      (patch.scheduleType
        ? patch.scheduleType === "times_per_week"
          ? "weekly"
          : "daily"
        : storedRepeat),
    scheduleType: patch.scheduleType ?? current.scheduleType,
    targetPerWeek:
      patch.targetPerWeek === undefined
        ? current.targetPerWeek
        : patch.targetPerWeek,
    weekdaysMask:
      patch.weekdaysMask === undefined
        ? current.weekdaysMask
        : patch.weekdaysMask,
  });
}

/**
 * The moods, groups, activities and goals of the journal, and the changes to
 * them. A change answers with the item as the journal shows it.
 */
export class CatalogLogic extends Logic<CatalogProps, Record<string, never>> {
  constructor(deps: CatalogProps) {
    super({ deps, initialState: {} });
  }

  /**
   * The moods, groups, activities and goals as the journal shows them. A new
   * database has no mood, so the first read adds the starting catalog.
   */
  async read(): Promise<Catalog> {
    const { storage, atomic } = this.deps;
    let moods = await storage.catalog.listMoods();
    if (moods.length === 0) {
      await atomic((planning) => planning.catalog.planSeedCatalog());
      moods = await storage.catalog.listMoods();
    }
    const [groups, activities, goals] = await Promise.all([
      storage.catalog.listGroups(),
      storage.catalog.listActivities(),
      storage.catalog.listGoals(),
    ]);
    return {
      moods: moods.map(toMood),
      groups: groups.map(toGroup),
      activities: activities.map(toActivity),
      goals: goals.map(toGoal),
    };
  }

  async createGroup({
    name,
  }: {
    name?: string | undefined;
  }): Promise<ActivityGroup> {
    const clean = (name ?? "").trim();
    if (!clean) {
      throw invalid("Group name is required.");
    }
    const id = `group-${crypto.randomUUID()}`;
    await this.deps.atomic((planning) => [
      planning.catalog.planInsertGroup({ id, name: clean }),
    ]);
    return this.readGroup({ id });
  }

  async createActivity({
    name,
    groupId,
    icon,
  }: {
    name?: string | undefined;
    groupId?: string | undefined;
    icon?: string | undefined;
  }): Promise<Activity> {
    const { storage, atomic } = this.deps;
    missing(
      await storage.catalog.findGroup({ id: groupId ?? "" }),
      "Choose an activity group.",
    );
    const clean = (name ?? "").trim();
    if (!clean) {
      throw invalid("Activity name is required.");
    }
    const id = `activity-${crypto.randomUUID()}`;
    await atomic((planning) => [
      planning.catalog.planInsertActivity({
        id,
        groupId: groupId ?? "",
        name: clean,
        icon: iconForActivity({
          name: clean,
          sourceIconId: icon ?? "category",
        }),
      }),
    ]);
    return this.readActivity({ id });
  }

  async createGoal(input: GoalCreate): Promise<Goal> {
    const { storage, atomic } = this.deps;
    const activityId = input.activityId ?? null;
    if (activityId !== null) {
      missing(
        await storage.catalog.findActivity({ id: activityId }),
        "Choose an activity for the goal.",
      );
    }
    const config = normalizeGoalConfig(input);
    if (!config.ok) {
      throw invalid(config.message);
    }
    const startDate = input.startDate ?? this.today();
    if (!isLogicalDate(startDate)) {
      throw invalid("Choose a valid goal start date.");
    }
    const id = `goal-${crypto.randomUUID()}`;
    await atomic((planning) => [
      planning.catalog.planInsertGoal({
        id,
        name: (input.name ?? "").trim() || UNNAMED_GOAL,
        activityId,
        materialIcon: isActivityIcon(input.materialIcon)
          ? input.materialIcon
          : DEFAULT_GOAL_ICON,
        repeatType: config.repeatType,
        scheduleType: config.scheduleType,
        targetPerWeek: config.targetPerWeek,
        weekdaysMask: config.weekdaysMask,
        reminderEnabled: input.reminderEnabled ?? false,
        reminderTime: input.reminderTime ?? null,
        startDate,
      }),
    ]);
    return this.readGoal({ id });
  }

  async updateGroup({
    id,
    patch,
  }: {
    id: string;
    patch: GroupPatch;
  }): Promise<ActivityGroup> {
    const current = missing(
      await this.deps.storage.catalog.findGroup({ id }),
      "Group not found.",
    );
    await this.deps.atomic((planning) => [
      planning.catalog.planUpdateGroup({
        id,
        name: patch.name?.trim() || current.name,
        sortOrder: patch.sortOrder ?? current.sortOrder,
        archivedAt: this.archivedAt({
          archived: patch.archived,
          current: current.archivedAt,
        }),
      }),
    ]);
    return this.readGroup({ id });
  }

  async updateActivity({
    id,
    patch,
  }: {
    id: string;
    patch: ActivityPatch;
  }): Promise<Activity> {
    const { storage, atomic } = this.deps;
    if (patch.groupId !== undefined) {
      missing(
        await storage.catalog.findGroup({ id: patch.groupId }),
        "Choose an activity group.",
      );
    }
    const current = missing(
      await storage.catalog.findActivity({ id }),
      "Activity not found.",
    );
    const name = patch.name?.trim() || current.name;
    await atomic((planning) => [
      planning.catalog.planUpdateActivity({
        id,
        name,
        groupId: patch.groupId ?? current.groupId,
        icon: iconForActivity({
          name,
          sourceIconId: patch.icon ?? current.materialIcon,
        }),
        sortOrder: patch.sortOrder ?? current.sortOrder,
        archivedAt: this.archivedAt({
          archived: patch.archived,
          current: current.archivedAt,
        }),
      }),
    ]);
    return this.readActivity({ id });
  }

  async updateGoal({
    id,
    patch,
  }: {
    id: string;
    patch: GoalPatch;
  }): Promise<Goal> {
    const { storage, atomic } = this.deps;
    const current = missing(
      await storage.catalog.findGoal({ id }),
      "Goal not found.",
    );
    if (patch.activityId !== undefined && patch.activityId !== null) {
      missing(
        await storage.catalog.findActivity({ id: patch.activityId }),
        "Choose an activity for the goal.",
      );
    }
    const config = currentGoalConfig(current, patch);
    if (!config.ok) {
      throw invalid(config.message);
    }
    await atomic((planning) => [
      planning.catalog.planUpdateGoal({
        id,
        name: patch.name?.trim() || current.name,
        activityId:
          patch.activityId === undefined
            ? current.activityId
            : patch.activityId,
        materialIcon: isActivityIcon(patch.materialIcon)
          ? patch.materialIcon
          : patch.materialIcon === undefined
            ? current.materialIcon
            : DEFAULT_GOAL_ICON,
        repeatType: config.repeatType,
        scheduleType: config.scheduleType,
        targetPerWeek: config.targetPerWeek,
        weekdaysMask: config.weekdaysMask,
        sortOrder: patch.sortOrder ?? current.sortOrder,
        reminderEnabled:
          patch.reminderEnabled ?? Boolean(current.reminderEnabled),
        reminderTime: patch.reminderTime ?? current.reminderTime,
        archivedAt: this.archivedAt({
          archived: patch.archived,
          current: current.archivedAt,
        }),
      }),
    ]);
    return this.readGoal({ id });
  }

  /** Delete a group with its activities and their records on the days. */
  async deleteGroup({ id }: { id: string }): Promise<void> {
    const { storage, atomic } = this.deps;
    missing(await storage.catalog.findGroup({ id }), "Group not found.");
    await atomic((planning) => [
      ...planning.catalog.planDeleteActivities({
        column: "group_id",
        value: id,
      }),
      planning.catalog.planDeleteGroup({ id }),
    ]);
  }

  /** Delete an activity and remove it from each day. A goal linked to it stays. */
  async deleteActivity({ id }: { id: string }): Promise<void> {
    const { storage, atomic } = this.deps;
    missing(await storage.catalog.findActivity({ id }), "Activity not found.");
    await atomic((planning) =>
      planning.catalog.planDeleteActivities({ column: "id", value: id }),
    );
  }

  /** Delete a goal and its completion history. */
  async deleteGoal({ id }: { id: string }): Promise<void> {
    const { storage, atomic } = this.deps;
    missing(await storage.catalog.findGoal({ id }), "Goal not found.");
    await atomic((planning) => planning.catalog.planDeleteGoal({ id }));
  }

  /** Move items, all or none. A move from a stale view is a conflict. */
  async reorder({
    kind,
    updates,
  }: {
    kind: CatalogKind;
    updates: SortOrderUpdate[];
  }): Promise<void> {
    const { storage } = this.deps;
    const existing = await storage.catalog.countExisting({
      kind,
      ids: updates.map((update) => update.id),
    });
    if (existing !== updates.length) {
      throw invalid("Catalog item not found.");
    }
    const outcome = await storage.catalog.applySortOrders({ kind, updates });
    if (outcome === "stale") {
      throw new AppError({
        code: "CONFLICT",
        message: "Setup changed on another device. Refresh before reordering.",
      });
    }
  }

  private today(): string {
    return new Date(this.deps.services.clock.now()).toISOString().slice(0, 10);
  }

  /** `archived` unset keeps the time of the row, `true` is now, and `false` clears it. */
  private archivedAt({
    archived,
    current,
  }: {
    archived: boolean | undefined;
    current: string | null;
  }): string | null {
    if (archived === undefined) {
      return current;
    }
    return archived
      ? new Date(this.deps.services.clock.now()).toISOString()
      : null;
  }

  private async readGroup({ id }: { id: string }): Promise<ActivityGroup> {
    return toGroup(
      missing(
        await this.deps.storage.catalog.findGroup({ id }),
        "Group not found.",
      ),
    );
  }

  private async readActivity({ id }: { id: string }): Promise<Activity> {
    return toActivity(
      missing(
        await this.deps.storage.catalog.findActivity({ id }),
        "Activity not found.",
      ),
    );
  }

  private async readGoal({ id }: { id: string }): Promise<Goal> {
    return toGoal(
      missing(
        await this.deps.storage.catalog.findGoal({ id }),
        "Goal not found.",
      ),
    );
  }
}
