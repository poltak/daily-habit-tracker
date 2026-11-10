import type { BackendStorageProps } from "../../core/storage/types.js";
import type { AppSettingRow } from "./types.js";

/** The settings of the journal, one row for each key. */
export class SettingsStorage {
  constructor(private readonly deps: BackendStorageProps) {}

  async findValue({ key }: { key: string }): Promise<string | undefined> {
    const row = await this.deps.db
      .selectFrom("appSettings")
      .select("value")
      .where("key", "=", key)
      .executeTakeFirst();
    return row?.value;
  }

  listAll(): Promise<AppSettingRow[]> {
    return this.deps.db
      .selectFrom("appSettings")
      .selectAll()
      .orderBy("key")
      .execute();
  }
}
