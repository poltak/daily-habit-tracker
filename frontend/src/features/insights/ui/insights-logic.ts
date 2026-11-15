import { Logic, type TaskState } from "@app/common/features/core/logic/logic";
import { logicalDateInTimeZone } from "@app/common/features/core/utils/logical-date";
import type { InsightsData } from "@app/common/features/insights/types";
import { requireApiSuccess } from "../../api/client/api-client.js";
import type { FrontendLogicProps } from "../../core/logic/types.js";
import { createMemo } from "../utils/memo.js";
import { describePeriod, type InsightsPeriod } from "../utils/period.js";
import {
  buildRelationshipView,
  type RelationshipView,
} from "../utils/relationship-view.js";
import { buildRhythmView, type RhythmView } from "../utils/rhythm-view.js";

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
  /** A year, or `all`. */
  relationshipYear: string;
  /** A weekday number (0 is Sunday), or `all`. */
  relationshipWeekday: string;
  activityId: string;
  pairActivityAId: string;
  pairActivityBId: string;
  /** A year, or an empty text for all years. */
  rhythmYear: string;
  /** An activity ID, or an empty text for no overlay. */
  overlayActivityId: string;
}

const NO_CHOICES = {
  relationshipYear: "all",
  relationshipWeekday: "all",
  activityId: "",
  pairActivityAId: "",
  pairActivityBId: "",
  rhythmYear: "",
  overlayActivityId: "",
} as const;

/**
 * The analysis of the whole saved history for a period that the owner picks.
 * The choices in the analysis stay while it shows, and start again after it
 * goes: a period without days, or a range that is not valid, hides it.
 */
export class InsightsLogic extends Logic<InsightsProps, InsightsState> {
  private readonly periodMemo = createMemo<InsightsPeriod>();
  private readonly relationshipMemo = createMemo<RelationshipView>();
  private readonly rhythmMemo = createMemo<RhythmView>();

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
        ...NO_CHOICES,
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

  /** The sections about activities. Call it only while the analysis shows. */
  relationships(): RelationshipView {
    const { data, relationshipYear, relationshipWeekday, activityId } =
      this.state;
    const { pairActivityAId, pairActivityBId } = this.state;
    const period = this.period();
    return this.relationshipMemo(
      [
        period.days,
        data,
        relationshipYear,
        relationshipWeekday,
        activityId,
        pairActivityAId,
        pairActivityBId,
      ],
      () =>
        buildRelationshipView({
          days: period.days,
          moods: data?.moods ?? [],
          activities: data?.activities ?? [],
          groups: data?.groups ?? [],
          choices: {
            year: relationshipYear,
            weekday: relationshipWeekday,
            activityId,
            pairActivityAId,
            pairActivityBId,
          },
        }),
    );
  }

  /**
   * The sections about weekdays, months and weeks. A week ends on
   * `weekEndsOn`, a weekday number where 0 is Sunday. Call it only while the
   * analysis shows.
   */
  rhythms({ weekEndsOn }: { weekEndsOn: number }): RhythmView {
    const { data, today, rhythmYear, overlayActivityId } = this.state;
    const period = this.period();
    return this.rhythmMemo(
      [period.days, data, today, weekEndsOn, rhythmYear, overlayActivityId],
      () =>
        buildRhythmView({
          days: period.days,
          moods: data?.moods ?? [],
          activities: data?.activities ?? [],
          startDate: period.range.startDate,
          endDate: period.range.endDate,
          asOf: today,
          weekEndsOn,
          choices: { year: rhythmYear, activityId: overlayActivityId },
        }),
    );
  }

  /**
   * Pick a period: `all`, `90d`, `1y`, a year, or `custom`. The custom dates
   * start as the dates of the period that was on show.
   */
  choosePeriod({ preset }: { preset: string }): void {
    const { range } = this.period();
    this.changePeriod({
      preset,
      ...(preset === "custom"
        ? { customStart: range.startDate, customEnd: range.endDate }
        : {}),
    });
  }

  setCustomStart({ value }: { value: string }): void {
    this.changePeriod({ customStart: value });
  }

  setCustomEnd({ value }: { value: string }): void {
    this.changePeriod({ customEnd: value });
  }

  chooseRelationshipYear({ value }: { value: string }): void {
    this.setState({ relationshipYear: value });
  }

  chooseRelationshipWeekday({ value }: { value: string }): void {
    this.setState({ relationshipWeekday: value });
  }

  chooseActivity({ activityId }: { activityId: string }): void {
    this.setState({ activityId });
  }

  chooseFirstOfPair({ activityId }: { activityId: string }): void {
    this.setState({ pairActivityAId: activityId });
  }

  chooseSecondOfPair({ activityId }: { activityId: string }): void {
    this.setState({ pairActivityBId: activityId });
  }

  choosePair({
    activityAId,
    activityBId,
  }: {
    activityAId: string;
    activityBId: string;
  }): void {
    this.setState({
      pairActivityAId: activityAId,
      pairActivityBId: activityBId,
    });
  }

  chooseRhythmYear({ value }: { value: string }): void {
    this.setState({ rhythmYear: value });
  }

  chooseOverlayActivity({ activityId }: { activityId: string }): void {
    this.setState({ overlayActivityId: activityId });
  }

  private changePeriod(
    change: Partial<
      Pick<InsightsState, "preset" | "customStart" | "customEnd">
    >,
  ): void {
    const { data, today, preset, customStart, customEnd } = this.state;
    const next = { preset, customStart, customEnd, ...change };
    const { showAnalysis } = describePeriod({ data, today, ...next });
    this.setState(showAnalysis ? next : { ...next, ...NO_CHOICES });
  }
}
