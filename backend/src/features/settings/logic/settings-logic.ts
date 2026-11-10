import {
  DEFAULT_WEEK_ENDS_ON,
  isWeekday,
} from "@app/common/features/settings/utils/week";
import { Logic } from "@app/common/features/core/logic/logic";
import type { BackendLogicProps } from "../../core/logic/types.js";

type SettingsProps = BackendLogicProps<"settings", "clock">;

interface Settings {
  weekEndsOn: number;
}

export class SettingsLogic extends Logic<SettingsProps, Record<string, never>> {
  constructor(deps: SettingsProps) {
    super({ deps, initialState: {} });
  }

  async read(): Promise<Settings> {
    const stored = Number(await this.deps.storage.settings.readWeekEndsOn());
    // A value that is not a weekday is read as the default, as the old app did.
    return { weekEndsOn: isWeekday(stored) ? stored : DEFAULT_WEEK_ENDS_ON };
  }

  /** Save the settings in the patch, and return all settings. */
  async update({
    patch,
  }: {
    patch: { weekEndsOn?: number | undefined };
  }): Promise<Settings> {
    if (patch.weekEndsOn !== undefined) {
      await this.deps.storage.settings.saveWeekEndsOn({
        weekEndsOn: patch.weekEndsOn,
        updatedAt: new Date(this.deps.services.clock.now()).toISOString(),
      });
    }
    return this.read();
  }
}
