import { Logic } from "@app/common/features/core/logic/logic";
import type { AppSettings } from "@app/common/features/settings/types";
import type { BackendLogicProps } from "../../core/logic/types.js";

type SettingsProps = BackendLogicProps<"settings">;

/** A week ends on Sunday until the owner chooses another day. */
const DEFAULT_WEEK_ENDS_ON = 0;

export class SettingsLogic extends Logic<SettingsProps, Record<string, never>> {
  constructor(deps: SettingsProps) {
    super({ deps, initialState: {} });
  }

  /** A stored value that is not a weekday counts as not set. */
  async read(): Promise<AppSettings> {
    const stored = await this.deps.storage.settings.readValue({
      key: "week_ends_on",
    });
    const weekEndsOn = Number(stored);
    return {
      weekEndsOn:
        stored !== undefined &&
        Number.isInteger(weekEndsOn) &&
        weekEndsOn >= 0 &&
        weekEndsOn <= 6
          ? weekEndsOn
          : DEFAULT_WEEK_ENDS_ON,
    };
  }
}
