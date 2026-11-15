import { Logic } from "@app/common/features/core/logic/logic";
import type { DaylioBackup } from "../types.js";
import type { PlannedStatement } from "../../core/database/planned-statement.js";
import type {
  BackendAtomicProps,
  BackendLogicProps,
} from "../../core/logic/types.js";
import type { ImportRunRow } from "../storage/types.js";
import { parseBackup } from "../utils/parse-backup.js";

type ImportProps = BackendLogicProps<"imports", "clock"> & BackendAtomicProps;

/** The import of a normalized Daylio backup. */
export class ImportLogic extends Logic<ImportProps, Record<string, never>> {
  constructor(deps: ImportProps) {
    super({ deps, initialState: {} });
  }

  /** The backup in `body`, checked as a whole. Nothing is written yet. */
  parse({ body }: { body: unknown }): DaylioBackup {
    return parseBackup(body);
  }

  /**
   * Write the statements of the days and the catalog and the record of the
   * run in one batch, so that an import that fails changes nothing. A failed
   * import leaves a run with the status `failed`.
   */
  async apply({
    backup,
    statements,
  }: {
    backup: DaylioBackup;
    statements: readonly PlannedStatement<unknown>[];
  }): Promise<void> {
    const { atomic } = this.deps;
    const sourceSha256 = backup.sourceSha256 ?? `manual-${crypto.randomUUID()}`;
    const run = {
      id: `import-${sourceSha256.slice(0, 32)}`,
      sourceSha256,
      sourceVersion:
        String((backup as { backupVersion?: unknown }).backupVersion ?? "") ||
        null,
    };
    const timestamp = new Date(this.deps.services.clock.now()).toISOString();
    try {
      await atomic((planning) => [
        ...statements,
        planning.imports.planRecordRun({
          ...run,
          status: "completed",
          timestamp,
          reportJson: JSON.stringify({
            entries: backup.entries.length,
            activities: backup.activities.length,
            goals: backup.goals.length,
            completions: backup.completions.length,
          }),
        }),
      ]);
    } catch (error) {
      try {
        await atomic((planning) => [
          planning.imports.planRecordRun({
            ...run,
            status: "failed",
            timestamp,
            reportJson: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
            }),
          }),
        ]);
      } catch {
        // The error of the import is the one to report.
      }
      throw error;
    }
  }

  /** Every run, for the export file. */
  exportRows(): Promise<ImportRunRow[]> {
    return this.deps.storage.imports.listAll();
  }
}
