import { Logic, type TaskState } from "@app/common/features/core/logic/logic";
import { logicalDateInTimeZone } from "@app/common/features/core/utils/logical-date";
import type { InsightsData } from "@app/common/features/insights/types";
import { requireApiSuccess } from "../../api/client/api-client.js";
import type { FrontendLogicProps } from "../../core/logic/types.js";
import {
  buildInsightsView,
  type InsightsView,
} from "../utils/insights-view.js";
import { createMemo } from "../utils/memo.js";
import { describePeriod, type InsightsPeriod } from "../utils/period.js";

type InsightsProps = FrontendLogicProps<never, "clock", "insights">;

interface InsightsState {
  data: InsightsData | null;
  loadState: TaskState;
  loadError: string | null;
  /** The day of the owner's clock when the page opened. */
  today: string;
  /** `all`, `90d`, `1y`, a year such as `2025`, or `custom`. */
  preset: string;
  customStart: string;
  customEnd: string;
}

/**
 * The analysis of the whole saved history for a period that the owner picks.
 */
export class InsightsLogic extends Logic<InsightsProps, InsightsState> {
  private readonly periodMemo = createMemo<InsightsPeriod>();
  private readonly viewMemo = createMemo<InsightsView>();

  constructor(deps: InsightsProps) {
    const { clock } = deps.services;
    super({
      deps,
      initialState: {
        data: null,
        loadState: "pristine",
        loadError: null,
        today: logicalDateInTimeZone({
          now: clock.now(),
          timeZone: clock.timeZone(),
        }),
        preset: "all",
        customStart: "",
        customEnd: "",
      },
    });
  }

  protected override async onInitialize(): Promise<void> {
    await this.load();
  }

  /** Read the history. Also the retry after a failure. */
  async load(): Promise<void> {
    await this.executeTask("load", async () => {
      const response = await this.deps.api.insights.$get(
        {},
        { init: { signal: this.signal, cache: "no-store" } },
      );
      await requireApiSuccess(response);
      if (response.status !== 200) {
        throw new Error("Could not read your insights. Please try again.");
      }
      this.setState({ data: await response.json() });
    });
  }

  /** The days of the period that the owner picked. */
  period(): InsightsPeriod {
    const { data, today, preset, customStart, customEnd } = this.state;
    return this.periodMemo([data, today, preset, customStart, customEnd], () =>
      describePeriod({ data, today, preset, customStart, customEnd }),
    );
  }

  /**
   * The five sections for the current period. A week ends on `weekEndsOn`, a
   * weekday number where 0 is Sunday. Call it only for a valid range.
   */
  view({ weekEndsOn }: { weekEndsOn: number }): InsightsView {
    const { data, preset } = this.state;
    const period = this.period();
    return this.viewMemo([period, data, preset, weekEndsOn], () =>
      buildInsightsView({
        period,
        preset,
        moods: data?.moods ?? [],
        activities: data?.activities ?? [],
        groups: data?.groups ?? [],
        weekEndsOn,
      }),
    );
  }

  /**
   * Pick a period: `all`, `90d`, `1y`, a year, or `custom`. The custom dates
   * start as the dates of the period that was on show.
   */
  choosePeriod({ preset }: { preset: string }): void {
    const { range } = this.period();
    this.setState({
      preset,
      ...(preset === "custom"
        ? { customStart: range.startDate, customEnd: range.endDate }
        : {}),
    });
  }

  setCustomStart({ value }: { value: string }): void {
    this.setState({ customStart: value });
  }

  setCustomEnd({ value }: { value: string }): void {
    this.setState({ customEnd: value });
  }
}
