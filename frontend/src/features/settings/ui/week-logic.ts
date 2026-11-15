import { Logic, type TaskState } from "@app/common/features/core/logic/logic";
import {
  DEFAULT_WEEK_ENDS_ON,
  weekRangeLabel,
} from "@app/common/features/settings/utils/week";
import { requireApiSuccess } from "../../api/client/api-client.js";
import { failureMessage } from "../../core/logic/failure-message.js";
import type { FrontendLogicProps } from "../../core/logic/types.js";
import type { App } from "../../core/types.js";
import { LeaveLockPlugin } from "../../core/ui/leave-lock-plugin.js";
import { PageNoticePlugin } from "../../core/ui/page-notice-plugin.js";

type WeekProps = FrontendLogicProps<never, never, "settings"> &
  Pick<App, "navigationLockEvents" | "pageNoticeEvents">;

interface WeekState {
  /** The day that the week ends on. It is the default until the saved value is read. */
  weekEndsOn: number;
  loadState: TaskState;
  loadError: string | null;
  saveState: TaskState;
  saveError: string | null;
}

/** The day on which the week ends, which every device of the journal shares. */
export class WeekLogic extends Logic<
  WeekProps,
  WeekState,
  never,
  { leaveLock: LeaveLockPlugin; pageNotice: PageNoticePlugin }
> {
  constructor(deps: WeekProps) {
    super({
      deps,
      plugins: {
        leaveLock: (pluginDeps) =>
          new LeaveLockPlugin({
            navigationLockEvents: pluginDeps.navigationLockEvents,
            reason: "setup",
          }),
        pageNotice: (pluginDeps) =>
          new PageNoticePlugin({
            pageNoticeEvents: pluginDeps.pageNoticeEvents,
          }),
      },
      initialState: {
        weekEndsOn: DEFAULT_WEEK_ENDS_ON,
        loadState: "pristine",
        loadError: null,
        saveState: "pristine",
        saveError: null,
      },
    });
  }

  protected override async onInitialize(): Promise<void> {
    this.registerCleanup(
      this.subscribe(() =>
        this.plugins.leaveLock.update({
          busy: this.state.saveState === "running",
        }),
      ),
    );
    await this.executeTask("load", async () => {
      const response = await this.deps.api.settings.$get(undefined, {
        init: { signal: this.signal },
      });
      await requireApiSuccess(response);
      if (response.status !== 200) {
        throw new Error("Unexpected settings response");
      }
      this.setState({
        weekEndsOn: (await response.json()).settings.weekEndsOn,
      });
    });
    if (this.state.loadError) {
      this.plugins.pageNotice.show({
        notice: { kind: "error", text: this.state.loadError },
      });
    }
  }

  /** The value shown changes only after the backend saved it, so every device agrees. */
  async changeWeekEnd({ weekEndsOn }: { weekEndsOn: number }): Promise<void> {
    await this.executeTask("save", async () => {
      try {
        const response = await this.deps.api.settings.$patch(
          { json: { weekEndsOn } },
          { init: { signal: this.signal } },
        );
        await requireApiSuccess(response);
        if (response.status !== 200) {
          throw new Error("Unexpected settings response");
        }
        this.setState({
          weekEndsOn: (await response.json()).settings.weekEndsOn,
        });
      } catch (error) {
        throw new Error(failureMessage(error), { cause: error });
      }
    });
    // A second call that returned early leaves the task running, and shows nothing.
    if (this.state.saveState === "success") {
      this.plugins.pageNotice.show({
        notice: {
          kind: "success",
          text: `Weeks now run ${weekRangeLabel(this.state.weekEndsOn)}.`,
        },
      });
    } else if (this.state.saveError) {
      this.plugins.pageNotice.show({
        notice: { kind: "error", text: this.state.saveError },
      });
    }
  }
}
