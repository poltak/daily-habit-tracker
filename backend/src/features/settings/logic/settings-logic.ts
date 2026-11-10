import { Logic } from "@app/common/features/core/logic/logic";
import type { BackendLogicProps } from "../../core/logic/types.js";
import type { AppSettingRow } from "../storage/types.js";

type SettingsProps = BackendLogicProps<"settings">;

/** The weekday on which a week ends, until the owner chooses one. 0 is Sunday. */
const DEFAULT_WEEK_ENDS_ON = 0;

/** The settings of the journal. */
export class SettingsLogic extends Logic<SettingsProps, Record<string, never>> {
  constructor(deps: SettingsProps) {
    super({ deps, initialState: {} });
  }

  /** The weekday (0 is Sunday) on which a week ends. */
  async readWeekEndsOn(): Promise<number> {
    const value = await this.deps.storage.settings.findValue({
      key: "week_ends_on",
    });
    const weekday = Number(value);
    const isWeekday =
      value !== undefined &&
      Number.isInteger(weekday) &&
      weekday >= 0 &&
      weekday <= 6;
    return isWeekday ? weekday : DEFAULT_WEEK_ENDS_ON;
  }

  /** Every row, for the export file. */
  exportRows(): Promise<AppSettingRow[]> {
    return this.deps.storage.settings.listAll();
  }
}
