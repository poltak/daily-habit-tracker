import { Logic } from "@app/common/features/core/logic/logic";
import type { BackendLogicProps } from "../../core/logic/types.js";

type ExportProps = BackendLogicProps<never, "clock">;

type Row = object;

/** The rows of each table of the journal, in the names of the TypeScript code. */
export interface ExportTables {
  moodLevels: readonly Row[];
  activityGroups: readonly Row[];
  activities: readonly Row[];
  entries: readonly Row[];
  entryActivities: readonly Row[];
  goals: readonly Row[];
  goalCompletions: readonly Row[];
  dayMoodSelections: readonly Row[];
  dayActivitySelections: readonly Row[];
  importRuns: readonly Row[];
  appSettings: readonly Row[];
}

const FORMAT_VERSION = 1;

/** The name that the database has for a column: `sourceSha256` is `source_sha256`. */
function snakeCase(name: string): string {
  return name.replaceAll(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function inDatabaseNames(row: Row): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([column, value]) => [snakeCase(column), value]),
  );
}

/** The file of the owner's export: every table, with the names of the database. */
export class ExportLogic extends Logic<ExportProps, Record<string, never>> {
  constructor(deps: ExportProps) {
    super({ deps, initialState: {} });
  }

  buildFile({ tables }: { tables: ExportTables }) {
    return {
      formatVersion: FORMAT_VERSION,
      exportedAt: new Date(this.deps.services.clock.now()).toISOString(),
      tables: Object.fromEntries(
        Object.entries(tables).map(([table, rows]) => [
          snakeCase(table),
          rows.map(inDatabaseNames),
        ]),
      ),
    };
  }
}
