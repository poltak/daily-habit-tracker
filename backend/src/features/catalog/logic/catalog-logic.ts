import { Logic } from "@app/common/features/core/logic/logic";
import type {
  Activity,
  ActivityGroup,
  Catalog,
  Goal,
  Mood,
} from "@app/common/features/catalog/types";
import { iconForActivity } from "@app/common/features/catalog/utils/activity-icon";
import type { DaylioBackup, ImportIds } from "../../import/types.js";
import type { PlannedStatement } from "../../core/database/planned-statement.js";
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
import { SEED_MOODS } from "../utils/seed-catalog.js";

type CatalogProps = BackendLogicProps<"catalog", "clock"> & BackendAtomicProps;

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
    const { storage } = this.deps;
    const moods = await this.readMoodsWithSeed();
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

  /** Every row of the tables of the catalog, for the export file. */
  async exportRows() {
    const { storage } = this.deps;
    const [moodLevels, activityGroups, activities, goals] = await Promise.all([
      this.readMoodsWithSeed(),
      storage.catalog.listGroups(),
      storage.catalog.listActivities(),
      storage.catalog.listGoals(),
    ]);
    return { moodLevels, activityGroups, activities, goals };
  }

  /**
   * The statements that write the catalog of a backup, and the IDs that the
   * records get. `finish` must run after the statements that write the days.
   * A standard mood keeps its ID, and its name and face, as a backup names
   * the same five moods.
   */
  async planImport({ backup }: { backup: DaylioBackup }): Promise<{
    ids: ImportIds;
    statements: PlannedStatement<never>[];
    finish: PlannedStatement<never>[];
  }> {
    const { storage } = this.deps;
    const existingMoods = await this.readMoodsWithSeed();
    const importedAt = new Date(this.deps.services.clock.now()).toISOString();
    const ids: ImportIds = {
      moods: new Map(
        backup.moods.map((mood) => [
          mood.sourceId,
          existingMoods.find((existing) => existing.score === mood.score)?.id ??
            `daylio-mood-${mood.sourceId}`,
        ]),
      ),
      activities: new Map(
        backup.activities.map((item) => [
          item.sourceId,
          `daylio-activity-${item.sourceId}`,
        ]),
      ),
      goals: new Map(
        backup.goals.map((item) => [
          item.sourceId,
          `daylio-goal-${item.sourceId}`,
        ]),
      ),
    };
    const groupIds = new Map(
      backup.groups.map((item) => [
        item.sourceId,
        `daylio-group-${item.sourceId}`,
      ]),
    );
    const archivedAt = (archived: boolean | undefined) =>
      archived ? importedAt : null;
    return {
      ids,
      statements: [
        ...storage.catalog.planImportMoods({
          moods: backup.moods.map((mood) => {
            const id = ids.moods.get(mood.sourceId) ?? mood.sourceId;
            const [, score, name, emoji, color] =
              SEED_MOODS.rows.find(
                (row) =>
                  row[0] === id ||
                  row[1] === mood.score ||
                  String(row[2]).toLowerCase() === mood.name.toLowerCase(),
              ) ?? [];
            const finalScore = Number(score ?? mood.score);
            return {
              id,
              score: finalScore,
              name: String(name ?? mood.name),
              emoji: String(emoji ?? mood.emoji ?? "🙂"),
              color: String(color ?? "#9aa4ae"),
              sortOrder: -finalScore,
              sourceId: mood.sourceId,
            };
          }),
        }),
        ...storage.catalog.planImportGroups({
          groups: backup.groups.map((item) => ({
            id: groupIds.get(item.sourceId) ?? item.sourceId,
            name: item.name,
            sortOrder: item.sortOrder,
            archivedAt: archivedAt(item.archived),
            sourceId: item.sourceId,
          })),
        }),
        ...storage.catalog.planImportActivities({
          activities: backup.activities.map((item) => ({
            id: ids.activities.get(item.sourceId) ?? item.sourceId,
            groupId: groupIds.get(item.groupSourceId) ?? item.groupSourceId,
            name: item.name,
            materialIcon: iconForActivity({
              name: item.name,
              sourceIconId: item.sourceIconId ?? undefined,
            }),
            sourceIconId: item.sourceIconId ?? null,
            sourceState: item.sourceState ?? null,
            sortOrder: item.sortOrder,
            archivedAt: archivedAt(item.archived),
            sourceId: item.sourceId,
          })),
        }),
        ...storage.catalog.planImportGoals({
          goals: backup.goals.map((item) => ({
            id: ids.goals.get(item.sourceId) ?? item.sourceId,
            activityId: item.activitySourceId
              ? (ids.activities.get(item.activitySourceId) ?? null)
              : null,
            name: item.name,
            materialIcon: item.materialIcon ?? "task_alt",
            repeatType: item.repeatType ?? "daily",
            scheduleType: item.scheduleType,
            targetPerWeek: item.targetPerWeek ?? null,
            weekdaysMask: item.weekdaysMask ?? null,
            sortOrder: item.sortOrder,
            reminderEnabled: item.reminderEnabled ? 1 : 0,
            reminderTime: item.reminderTime ?? null,
            archivedAt: archivedAt(item.archived),
            sourceId: item.sourceId,
            sourceState: item.sourceState ?? null,
          })),
        }),
      ],
      finish: [storage.catalog.planBackfillGoalStartDates()],
    };
  }

  /** The moods, best first. A database without a mood gets the starting catalog first. */
  private async readMoodsWithSeed(): Promise<MoodRow[]> {
    const { storage, atomic } = this.deps;
    const moods = await storage.catalog.listMoods();
    if (moods.length > 0) {
      return moods;
    }
    await atomic((planning) => planning.catalog.planSeedCatalog());
    return storage.catalog.listMoods();
  }
}
