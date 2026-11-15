import {
  planRaw,
  type PlannedStatement,
} from "../../core/database/planned-statement.js";
import type { BackendStorageProps } from "../../core/storage/types.js";
import type { ImportRunRow } from "./types.js";

export interface ImportRunWrite {
  id: string;
  sourceSha256: string;
  sourceVersion: string | null;
  status: "completed" | "failed";
  reportJson: string;
  timestamp: string;
}

/** The record of each backup that was imported. */
export class ImportStorage {
  constructor(private readonly deps: BackendStorageProps) {}

  listAll(): Promise<ImportRunRow[]> {
    return this.deps.db
      .selectFrom("importRuns")
      .selectAll()
      .orderBy("startedAt")
      .orderBy("id")
      .execute();
  }

  /** A backup that comes again updates the run of its first import. */
  planRecordRun(run: ImportRunWrite): PlannedStatement<never> {
    return planRaw({
      sql: `INSERT INTO import_runs (id, source_system, source_sha256, source_version, status, report_json, started_at, completed_at)
        VALUES (?, 'daylio', ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_sha256) DO UPDATE SET status = excluded.status,
          report_json = excluded.report_json, started_at = excluded.started_at,
          completed_at = excluded.completed_at`,
      parameters: [
        run.id,
        run.sourceSha256,
        run.sourceVersion,
        run.status,
        run.reportJson,
        run.timestamp,
        run.timestamp,
      ],
    });
  }
}
