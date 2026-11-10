import type { Generated } from "kysely";

/** This table comes from the old app (`backend/migrations/0008`), and it keeps its columns. */
interface AppSettingTable {
  key: string;
  value: string;
  updatedAt: Generated<string>;
}

export interface SettingsTables {
  appSettings: AppSettingTable;
}
