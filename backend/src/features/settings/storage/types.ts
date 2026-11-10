import type { Generated, Selectable } from "kysely";

/**
 * This table comes from the old app (`backend/migrations/0008`), and it keeps
 * its columns. A time is the text that `toISOString()` writes.
 */
interface AppSettingTable {
  key: string;
  value: string;
  updatedAt: Generated<string>;
}

export interface SettingsTables {
  appSettings: AppSettingTable;
}

export type AppSettingRow = Selectable<AppSettingTable>;
