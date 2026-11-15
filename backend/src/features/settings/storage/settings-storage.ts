import type { BackendStorageProps } from "../../core/storage/types.js";
import type { AppSettingRow } from "./types.js";

/** The old app stored the week setting under this key. */
const WEEK_ENDS_ON_KEY = "week_ends_on";

/** The settings of the journal that every device shares. */
export class SettingsStorage {
  constructor(private readonly deps: BackendStorageProps) {}

  async readWeekEndsOn(): Promise<string | undefined> {
    const row = await this.deps.db
      .selectFrom("appSettings")
      .select("value")
      .where("key", "=", WEEK_ENDS_ON_KEY)
      .executeTakeFirst();
    return row?.value;
  }

  async saveWeekEndsOn({
    weekEndsOn,
    updatedAt,
  }: {
    weekEndsOn: number;
    updatedAt: string;
  }): Promise<void> {
    await this.deps.db
      .insertInto("appSettings")
      .values({
        key: WEEK_ENDS_ON_KEY,
        value: String(weekEndsOn),
        updatedAt,
      })
      .onConflict((conflict) =>
        conflict.column("key").doUpdateSet({
          value: String(weekEndsOn),
          updatedAt,
        }),
      )
      .execute();
  }

  /** Every row, for the export file. */
  listAll(): Promise<AppSettingRow[]> {
    return this.deps.db
      .selectFrom("appSettings")
      .selectAll()
      .orderBy("key")
      .execute();
  }
}
