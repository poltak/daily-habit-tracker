import { Logic } from "@app/common/features/core/logic/logic";
import type {
  Activity,
  ActivityGroup,
  Catalog,
  Goal,
  Mood,
} from "@app/common/features/catalog/types";
import { iconForActivity } from "@app/common/features/catalog/utils/activity-icon";
import type {
  BackendAtomicProps,
  BackendLogicProps,
} from "../../core/logic/types.js";
import type {
  ActivityGroupRow,
  ActivityRow,
  GoalRow,
  MoodRow,
} from "../storage/types.js";

type CatalogProps = BackendLogicProps<"catalog"> & BackendAtomicProps;

/** The icon that stands for an activity whose stored icon is the old placeholder. */
const PLACEHOLDER_ICON = "✨";

function toMood(row: MoodRow): Mood {
  return {
    id: row.id,
    name: row.name,
    score: row.score,
    emoji: row.emoji,
    color: row.color,
  };
}

function toGroup(row: ActivityGroupRow): ActivityGroup {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    archived: Boolean(row.archivedAt),
  };
}

function toActivity(row: ActivityRow): Activity {
  const icon = iconForActivity({
    name: row.name,
    sourceIconId:
      row.materialIcon !== PLACEHOLDER_ICON
        ? row.materialIcon
        : (row.sourceIconId ?? undefined),
  });
  return {
    id: row.id,
    groupId: row.groupId,
    name: row.name,
    icon,
    ...(row.sourceIconId === null ? {} : { sourceIconId: row.sourceIconId }),
    sortOrder: row.sortOrder,
    archived: Boolean(row.archivedAt),
  };
}

function toGoal(row: GoalRow): Goal {
  const repeatType =
    row.repeatType === "weekly" || row.scheduleType === "times_per_week"
      ? "weekly"
      : "daily";
  return {
    id: row.id,
    activityId: row.activityId,
    name: row.name,
    materialIcon: row.materialIcon,
    repeatType,
    scheduleType: row.scheduleType as Goal["scheduleType"],
    ...(row.targetPerWeek === null ? {} : { targetPerWeek: row.targetPerWeek }),
    ...(row.weekdaysMask === null ? {} : { weekdaysMask: row.weekdaysMask }),
    ...(row.startDate === null ? {} : { startDate: row.startDate }),
    ...(row.endDate === null ? {} : { endDate: row.endDate }),
    sortOrder: row.sortOrder,
    archived: Boolean(row.archivedAt),
    reminderEnabled: Boolean(row.reminderEnabled),
    ...(row.reminderTime === null ? {} : { reminderTime: row.reminderTime }),
    ...(row.sourceState === null ? {} : { sourceState: row.sourceState }),
  };
}

export class CatalogLogic extends Logic<CatalogProps, Record<string, never>> {
  constructor(deps: CatalogProps) {
    super({ deps, initialState: {} });
  }

  /** One goal, also an archived one, or `undefined` when no goal has the ID. */
  async readGoal({ id }: { id: string }): Promise<Goal | undefined> {
    const row = await this.deps.storage.catalog.findGoal({ id });
    return row && toGoal(row);
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
}
