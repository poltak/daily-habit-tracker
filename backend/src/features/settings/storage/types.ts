import type { Selectable } from "kysely";

/**
 * This table comes from the old app (`backend/migrations/0008`), and it keeps
 * its columns. The week setting is the row with the key `week_ends_on`.
 */
interface AppSettingTable {
  key: string;
  /** The text of the value. */
  value: string;
  /** An ISO 8601 time, as the old app wrote it. */
  updatedAt: string;
}

export interface SettingsTables {
  appSettings: AppSettingTable;
}

export type AppSettingRow = Selectable<AppSettingTable>;
