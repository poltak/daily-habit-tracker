import type { Generated, Selectable } from "kysely";

/**
 * This table comes from the old app (`backend/migrations/0000`), and it keeps
 * its columns. A time is the text that `toISOString()` writes.
 */
interface ImportRunTable {
  id: string;
  sourceSystem: string;
  /** Unique. A backup that comes again updates its run. */
  sourceSha256: string;
  sourceVersion: string | null;
  status: string;
  reportJson: string;
  startedAt: Generated<string>;
  completedAt: string | null;
}

export interface ImportTables {
  importRuns: ImportRunTable;
}

export type ImportRunRow = Selectable<ImportRunTable>;
