import { Logic, type TaskState } from "@app/common/features/core/logic/logic";
import {
  isMonth,
  logicalDateInTimeZone,
  shiftMonth,
} from "@app/common/features/core/utils/logical-date";
import type { CalendarEntryDay } from "@app/common/features/days/types";
import { requireApiSuccess } from "../../api/client/api-client.js";
import type { FrontendLogicProps } from "../../core/logic/types.js";

type CalendarProps = FrontendLogicProps<never, "clock", "calendar"> & {
  /** The month to show first, as `YYYY-MM`. */
  initialMonth: string;
};

interface CalendarState {
  month: string;
  /** The days of the month that have an entry. */
  days: CalendarEntryDay[];
  /** The month of today. The calendar shows no later month. */
  currentMonth: string;
  loadMonthState: TaskState;
  loadMonthError: string | null;
}

/** One month of the calendar: the days that have an entry, and the mood of each. */
export class CalendarLogic extends Logic<CalendarProps, CalendarState> {
  constructor(deps: CalendarProps) {
    const { clock } = deps.services;
    const currentMonth = logicalDateInTimeZone({
      now: clock.now(),
      timeZone: clock.timeZone(),
    }).slice(0, 7);
    super({
      deps,
      initialState: {
        month: isMonth(deps.initialMonth) ? deps.initialMonth : currentMonth,
        days: [],
        currentMonth,
        loadMonthState: "pristine",
        loadMonthError: null,
      },
    });
  }

  protected override async onInitialize(): Promise<void> {
    await this.loadMonth();
  }

  /** Show the month `amount` months from the one on show. A month after today stays closed. */
  async showMonth({ amount }: { amount: number }): Promise<void> {
    const month = shiftMonth({ month: this.state.month, amount });
    if (
      this.state.loadMonthState === "running" ||
      month > this.state.currentMonth
    ) {
      return;
    }
    this.setState({ month, days: [] });
    await this.loadMonth();
  }

  /** Read the month again after a failure. */
  async loadMonth(): Promise<void> {
    const { month } = this.state;
    await this.executeTask("loadMonth", async () => {
      const response = await this.deps.api.calendar.$get(
        { query: { month } },
        { init: { signal: this.signal } },
      );
      await requireApiSuccess(response);
      if (response.status !== 200) {
        throw new Error("Could not load that month.");
      }
      this.setState({ days: (await response.json()).days });
    });
  }
}
