import { Logic, type TaskState } from "@app/common/features/core/logic/logic";
import {
  isMonth,
  logicalDateInTimeZone,
  shiftMonth,
} from "@app/common/features/core/utils/logical-date";
import type { GoalHistory } from "@app/common/features/goals/types";
import { requireApiSuccess } from "../../api/client/api-client.js";
import type { FrontendLogicProps } from "../../core/logic/types.js";
import type { App } from "../../core/types.js";
import { PageNoticePlugin } from "../../core/ui/page-notice-plugin.js";

type GoalProps = FrontendLogicProps<never, "clock", "goals"> &
  Pick<App, "pageNoticeEvents"> & {
    goalId: string;
    /** The month to show first, as `YYYY-MM`. */
    initialMonth: string;
  };

interface GoalState {
  month: string;
  /** The history of `month`. It is `null` while that month loads. */
  history: GoalHistory | null;
  loadHistoryState: TaskState;
  loadHistoryError: string | null;
}

/** One goal: its month of completed days, and the result of each week of the month. */
export class GoalLogic extends Logic<
  GoalProps,
  GoalState,
  never,
  { pageNotice: PageNoticePlugin }
> {
  constructor(deps: GoalProps) {
    const { clock } = deps.services;
    super({
      deps,
      plugins: {
        pageNotice: (pluginDeps) =>
          new PageNoticePlugin({
            pageNoticeEvents: pluginDeps.pageNoticeEvents,
          }),
      },
      initialState: {
        month: isMonth(deps.initialMonth)
          ? deps.initialMonth
          : logicalDateInTimeZone({
              now: clock.now(),
              timeZone: clock.timeZone(),
            }).slice(0, 7),
        history: null,
        loadHistoryState: "pristine",
        loadHistoryError: null,
      },
    });
  }

  protected override async onInitialize(): Promise<void> {
    await this.loadHistory();
  }

  /** Show the month `amount` months from the one on show. */
  async showMonth({ amount }: { amount: number }): Promise<void> {
    if (this.state.loadHistoryState === "running") {
      return;
    }
    this.setState({
      month: shiftMonth({ month: this.state.month, amount }),
      history: null,
    });
    await this.loadHistory();
  }

  /** Read the month again, also after a failure. */
  async loadHistory(): Promise<void> {
    const { month } = this.state;
    const { clock } = this.deps.services;
    // The weeks are judged against the day of the device, not the day of the server.
    const asOf = logicalDateInTimeZone({
      now: clock.now(),
      timeZone: clock.timeZone(),
    });
    await this.executeTask("loadHistory", async () => {
      const history = await this.deps.api.goals[":goalId"].history.$get(
        { param: { goalId: this.deps.goalId }, query: { month, asOf } },
        { init: { signal: this.signal } },
      );
      await requireApiSuccess(history);
      if (history.status !== 200) {
        throw new Error("Could not load goal history.");
      }
      this.setState({ history: await history.json() });
    });
    if (this.state.loadHistoryError) {
      this.plugins.pageNotice.show({
        notice: { kind: "error", text: this.state.loadHistoryError },
      });
    }
  }
}
