import { LogicPlugin } from "@app/common/features/core/logic/logic-plugin";
import type {
  DayActivitySelection,
  GoalCompletion,
} from "@app/common/features/days/types";
import { requireApiSuccess } from "../../api/client/api-client.js";
import type { Draft } from "../utils/draft.js";
import type { FrontendLogicProps } from "../../core/logic/types.js";
import { isExpectedGoalResult, type GoalResult } from "../utils/goal-change.js";
import { isExpectedActivityResult } from "../utils/selection-change.js";
import {
  activityTapKeys,
  goalTapKeys,
  MOOD_KEY,
} from "../utils/selection-keys.js";

export type SelectionProps = FrontendLogicProps<
  "days",
  "clock",
  "day-selections" | "goal-completions"
>;

interface SelectionState {
  /** The items that the taps waiting for the server change. Waiting taps share no item. */
  pendingKeys: string[];
}

/** What the server answers to the tap on an activity. */
export interface ActivityResult {
  selection?: DayActivitySelection | undefined;
  affectedGoalCompletions: GoalCompletion[];
  affectedActivitySelections: DayActivitySelection[];
}

/** The result of a request, or the message of the failure. */
export type Outcome<Result> =
  { ok: true; result: Result } | { ok: false; message: string };

/**
 * The taps on the mood and on the activities of a day. The server keeps each
 * tap at once, also before the day is saved. Taps on different items run at
 * the same time.
 */
export class SelectionPlugin extends LogicPlugin<
  SelectionProps,
  SelectionState
> {
  constructor(deps: SelectionProps) {
    super({
      deps,
      initialState: { pendingKeys: [] },
    });
  }

  get isRunning(): boolean {
    return this.state.pendingKeys.length > 0;
  }

  /** True when a tap that waits changes one of the items. */
  isBlocked(keys: readonly string[]): boolean {
    return keys.some((key) => this.state.pendingKeys.includes(key));
  }

  /** Keep the draft of the day on this device, until the server has every tap. */
  storeDraft({
    logicalDate,
    draft,
  }: {
    logicalDate: string;
    draft: Draft;
  }): void {
    this.deps.storage.days.writeDraft({
      logicalDate,
      draft,
      savedAt: this.timestamp(),
    });
  }

  /** The stored draft goes when no other tap waits and the draft is not on this device only. */
  settleSaved({
    logicalDate,
    hasLocalDraft,
  }: {
    logicalDate: string;
    hasLocalDraft: boolean;
  }): void {
    if (!hasLocalDraft && !this.isRunning) {
      this.deps.storage.days.clearDraft({ logicalDate });
    }
  }

  /** The stored draft stays when the day had one before, or another tap waits. */
  settleFailed({
    logicalDate,
    draft,
    hadLocalDraft,
  }: {
    logicalDate: string;
    draft: Draft;
    hadLocalDraft: boolean;
  }): void {
    this.deps.storage.days.settleDraft({
      logicalDate,
      draft,
      savedAt: this.timestamp(),
      keep: hadLocalDraft || this.isRunning,
    });
  }

  async chooseMood({
    logicalDate,
    moodId,
  }: {
    logicalDate: string;
    moodId: string;
  }): Promise<Outcome<void>> {
    return this.run({ keys: [MOOD_KEY] }, async () => {
      const response = await this.deps.api["day-selections"][
        ":logicalDate"
      ].mood.$put(
        { param: { logicalDate }, json: { moodId } },
        { init: { signal: this.signal } },
      );
      await requireApiSuccess(response);
      if (
        response.status !== 200 ||
        (await response.json()).selection.moodId !== moodId
      ) {
        throw new Error("The mood update was out of date.");
      }
    });
  }

  /** The goals of the activity must follow it, or the answer is out of date. */
  async chooseActivity({
    logicalDate,
    activityId,
    selected,
    linkedGoalIds,
  }: {
    logicalDate: string;
    activityId: string;
    selected: boolean;
    linkedGoalIds: readonly string[];
  }): Promise<Outcome<ActivityResult>> {
    return this.run(
      { keys: activityTapKeys({ activityId, linkedGoalIds }) },
      async () => {
        const response = await this.deps.api["day-selections"][
          ":logicalDate"
        ].activities[":activityId"].$put(
          { param: { logicalDate, activityId }, json: { selected } },
          { init: { signal: this.signal } },
        );
        await requireApiSuccess(response);
        const result = response.status === 200 ? await response.json() : null;
        if (
          !result ||
          !isExpectedActivityResult({
            result,
            activityId,
            selected,
            linkedGoalIds,
          })
        ) {
          throw new Error("The activity update was out of date.");
        }
        return result;
      },
    );
  }

  /** The goals and the activity of the goal must follow it, or the answer is out of date. */
  async chooseGoal({
    logicalDate,
    goalId,
    completed,
    activityId,
    affectedGoalIds,
  }: {
    logicalDate: string;
    goalId: string;
    completed: boolean;
    activityId: string | null;
    affectedGoalIds: readonly string[];
  }): Promise<Outcome<GoalResult>> {
    return this.run(
      { keys: goalTapKeys({ goalId, activityId, affectedGoalIds }) },
      async () => {
        const response = await this.deps.api["goal-completions"][
          ":logicalDate"
        ][":goalId"].$put(
          { param: { logicalDate, goalId }, json: { completed } },
          { init: { signal: this.signal } },
        );
        await requireApiSuccess(response);
        const result = response.status === 200 ? await response.json() : null;
        if (
          !result?.completion ||
          !isExpectedGoalResult({
            result: { ...result, completion: result.completion },
            goalId,
            completed,
            activityId,
            affectedGoalIds,
          })
        ) {
          throw new Error("The goal update was out of date.");
        }
        return { ...result, completion: result.completion };
      },
    );
  }

  private timestamp(): string {
    return new Date(this.deps.services.clock.now()).toISOString();
  }

  private async run<Result>(
    { keys }: { keys: readonly string[] },
    request: () => Promise<Result>,
  ): Promise<Outcome<Result>> {
    this.setState({ pendingKeys: [...this.state.pendingKeys, ...keys] });
    let outcome: Outcome<Result>;
    try {
      outcome = { ok: true, result: await request() };
    } catch (error) {
      outcome = {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
    this.setState({
      pendingKeys: this.state.pendingKeys.filter((key) => !keys.includes(key)),
    });
    return outcome;
  }
}
