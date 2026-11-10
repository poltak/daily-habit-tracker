import {
  planRaw,
  type PlannedStatement,
} from "../../core/database/planned-statement.js";
import type { BackendStorageProps } from "../../core/storage/types.js";
import {
  SEED_ACTIVITIES,
  SEED_GOALS,
  SEED_GROUPS,
  SEED_MOODS,
} from "../utils/seed-catalog.js";
import type {
  ActivityGroupRow,
  ActivityRow,
  GoalRow,
  MoodRow,
} from "./types.js";

/** The moods, the activity groups, the activities and the goals. */
export class CatalogStorage {
  constructor(private readonly deps: BackendStorageProps) {}

  /** Best mood first. */
  listMoods(): Promise<MoodRow[]> {
    return this.deps.db
      .selectFrom("moodLevels")
      .selectAll()
      .orderBy("score", "desc")
      .execute();
  }

  listGroups(): Promise<ActivityGroupRow[]> {
    return this.deps.db
      .selectFrom("activityGroups")
      .selectAll()
      .orderBy("sortOrder")
      .execute();
  }

  listActivities(): Promise<ActivityRow[]> {
    return this.deps.db
      .selectFrom("activities")
      .selectAll()
      .orderBy("sortOrder")
      .execute();
  }

  listGoals(): Promise<GoalRow[]> {
    return this.deps.db
      .selectFrom("goals")
      .selectAll()
      .orderBy("sortOrder")
      .execute();
  }

  /**
   * The rows of a new journal. `insert or ignore` keeps a row that exists, so
   * two first requests at once do no harm. One statement for each row, because
   * a D1 statement binds one row of values.
   */
  planSeedCatalog(): PlannedStatement<never>[] {
    return [SEED_MOODS, SEED_GROUPS, SEED_ACTIVITIES, SEED_GOALS].flatMap(
      (insert) =>
        insert.rows.map((row) => planRaw({ sql: insert.sql, parameters: row })),
    );
  }
}
