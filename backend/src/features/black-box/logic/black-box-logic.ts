import { Logic } from "@app/common/features/core/logic/logic";
import { AppError } from "../../core/errors/app-error.js";
import type {
  BackendAtomicProps,
  BackendLogicProps,
} from "../../core/logic/types.js";
import type { AppConfig } from "../../core/types.js";
import {
  SEED_ACTIVITIES,
  SEED_GOALS,
  SEED_GROUPS,
  SEED_MOODS,
} from "../utils/seed-catalog.js";

type BlackBoxProps = BackendLogicProps<"blackBox"> &
  BackendAtomicProps & { config: Pick<AppConfig, "blackBox"> };

/**
 * Empties the database between black-box tests. It refuses to run unless the
 * test-only setting is on, so a deployment cannot lose its data through it.
 */
export class BlackBoxLogic extends Logic<BlackBoxProps, Record<string, never>> {
  constructor(deps: BlackBoxProps) {
    super({ deps, initialState: {} });
  }

  /**
   * Delete each row of each app table, then add the catalog that a new
   * database of the old app has, in one batch.
   */
  async reset(): Promise<void> {
    const { storage, atomic, config } = this.deps;
    if (!config.blackBox) {
      throw new AppError({
        code: "NOT_FOUND",
        message: "The reset is off.",
      });
    }
    const tableNames = await storage.blackBox.listTableNames();
    await atomic((planning) => [
      planning.blackBox.planDeferForeignKeys(),
      ...tableNames.map((tableName) =>
        planning.blackBox.planDeleteAllRows({ tableName }),
      ),
      ...[SEED_MOODS, SEED_GROUPS, SEED_ACTIVITIES, SEED_GOALS].flatMap(
        (insert) => planning.blackBox.planSeedRows({ insert }),
      ),
    ]);
  }
}
