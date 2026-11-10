import type { BackendStorageProps } from "../../core/storage/types.js";

/** The settings of the journal, one row for each setting. */
export class SettingsStorage {
  constructor(private readonly deps: BackendStorageProps) {}

  /** The stored text of a setting, or `undefined` when it was never set. */
  async readValue({ key }: { key: string }): Promise<string | undefined> {
    const row = await this.deps.db
      .selectFrom("appSettings")
      .select("value")
      .where("key", "=", key)
      .executeTakeFirst();
    return row?.value;
  }
}
