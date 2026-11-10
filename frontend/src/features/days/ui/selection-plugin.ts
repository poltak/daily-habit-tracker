import { LogicPlugin } from "@app/common/features/core/logic/logic-plugin";
import type { TaskState } from "@app/common/features/core/logic/logic";
import type {
  DayActivitySelection,
  GoalCompletion,
} from "@app/common/features/days/types";
import { requireApiSuccess } from "../../api/client/api-client.js";
import type { FrontendLogicProps } from "../../core/logic/types.js";
import type { PendingSelection } from "../types.js";
import { isExpectedGoalResult, type GoalResult } from "../utils/goal-change.js";
import { isExpectedActivityResult } from "../utils/selection-change.js";

export type SelectionProps = FrontendLogicProps<
  never,
  never,
  "day-selections" | "goal-completions"
>;

interface SelectionState {
  /** The tap that waits for the server. */
  pending: PendingSelection | null;
  selectionState: TaskState;
  selectionError: string | null;
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
 * tap at once, also before the day is saved. One tap runs at a time.
 */
export class SelectionPlugin extends LogicPlugin<
  SelectionProps,
  SelectionState
> {
  constructor(deps: SelectionProps) {
    super({
      deps,
      initialState: {
        pending: null,
        selectionState: "pristine",
        selectionError: null,
      },
    });
  }

  get isRunning(): boolean {
    return this.state.selectionState === "running";
  }

  async chooseMood({
    logicalDate,
    moodId,
  }: {
    logicalDate: string;
    moodId: string;
  }): Promise<Outcome<void>> {
    return this.run({ pending: { kind: "mood" } }, async () => {
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
      { pending: { kind: "activity", id: activityId } },
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
    return this.run({ pending: { kind: "goal", id: goalId } }, async () => {
      const response = await this.deps.api["goal-completions"][":logicalDate"][
        ":goalId"
      ].$put(
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
    });
  }

  private async run<Result>(
    { pending }: { pending: PendingSelection },
    request: () => Promise<Result>,
  ): Promise<Outcome<Result>> {
    const settled: { result: Result }[] = [];
    this.setState({ pending });
    await this.executeTask("selection", async () => {
      settled.push({ result: await request() });
    });
    this.setState({ pending: null });
    const [value] = settled;
    return value
      ? { ok: true, result: value.result }
      : { ok: false, message: this.state.selectionError ?? "" };
  }
}
