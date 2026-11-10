import { sql } from "kysely";
import {
  planRaw,
  type PlannedStatement,
} from "../../core/database/planned-statement.js";
import type { BackendStorageProps } from "../../core/storage/types.js";
import type { SeedInsert } from "../utils/seed-catalog.js";

/** Quote a table name as an SQL identifier. */
function quoteName(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/** The deletes and the seed rows of the reset route for the black-box tests. */
export class BlackBoxStorage {
  constructor(private readonly deps: BackendStorageProps) {}

  /** Each table of the app. The migration record and the system tables stay out. */
  async listTableNames(): Promise<string[]> {
    const { rows } = await sql<{ name: string }>`
      select name from sqlite_master where type = 'table' order by name
    `.execute(this.deps.db);
    return rows
      .map(({ name }) => name)
      .filter(
        (name) =>
          !name.startsWith("sqlite_") &&
          !name.startsWith("_cf_") &&
          name !== "d1_migrations",
      );
  }

  /** Let the foreign keys wait for the end of the batch, so the deletes can run in any order. */
  planDeferForeignKeys(): PlannedStatement<never> {
    return planRaw({ sql: "pragma defer_foreign_keys = on" });
  }

  /** One statement for each row, because a D1 statement binds one row of values. */
  planSeedRows({ insert }: { insert: SeedInsert }): PlannedStatement<never>[] {
    return insert.rows.map((row) =>
      planRaw({ sql: insert.sql, parameters: row }),
    );
  }

  planDeleteAllRows({
    tableName,
  }: {
    tableName: string;
  }): PlannedStatement<never> {
    return planRaw({ sql: `delete from ${quoteName(tableName)}` });
  }
}
