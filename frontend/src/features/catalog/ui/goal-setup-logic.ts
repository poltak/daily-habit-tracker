import { Logic, type TaskState } from "@app/common/features/core/logic/logic";
import type { Activity, Goal } from "@app/common/features/catalog/types";
import {
  ALL_WEEKDAYS_MASK,
  goalRepeatType,
  goalWeekdayMask,
} from "@app/common/features/catalog/utils/goal-config";
import type { FrontendLogicProps } from "../../core/logic/types.js";
import { failureMessage } from "../../core/logic/failure-message.js";
import type { App } from "../../core/types.js";
import type { Notice } from "../../days/types.js";
import type { NoticeTarget } from "../types.js";
import { deleteWarning } from "../utils/catalog-mutations.js";
import { CatalogRequestsPlugin } from "./catalog-requests-plugin.js";

type GoalSetupProps = FrontendLogicProps<
  never,
  "device" | "dialogs",
  "catalog"
> &
  Pick<App, "catalogEvents"> & {
    goalId: string;
    /** The page that opened the goal, which shows the notice after an archive or a delete. */
    returnTo: NoticeTarget;
  };

const OFFLINE = "You’re offline. Reconnect before updating a goal.";

interface GoalSetupState {
  goal: Goal | null;
  activities: Activity[];
  name: string;
  activityId: string | null;
  repeatType: "daily" | "weekly";
  weekdaysMask: number;
  targetPerWeek: number;
  materialIcon: string;
  iconPickerOpen: boolean;
  /** The request that runs now: a save, an archive or a delete. */
  action: "save" | "archive" | "delete" | null;
  notice: Notice | null;
  loadGoalState: TaskState;
  loadGoalError: string | null;
}

/** The settings of one goal: its name, repeat, activity and icon, and its archive and delete. */
export class GoalSetupLogic extends Logic<
  GoalSetupProps,
  GoalSetupState,
  never,
  { requests: CatalogRequestsPlugin }
> {
  constructor(deps: GoalSetupProps) {
    super({
      deps,
      plugins: {
        requests: (pluginDeps) => new CatalogRequestsPlugin(pluginDeps),
      },
      initialState: {
        goal: null,
        activities: [],
        name: "",
        activityId: null,
        repeatType: "daily",
        weekdaysMask: ALL_WEEKDAYS_MASK,
        targetPerWeek: 1,
        materialIcon: "task_alt",
        iconPickerOpen: false,
        action: null,
        notice: null,
        loadGoalState: "pristine",
        loadGoalError: null,
      },
    });
  }

  protected override async onInitialize(): Promise<void> {
    await this.executeTask("loadGoal", async () => {
      const catalog = await this.plugins.requests.read();
      const goal = catalog.goals.find(
        (candidate) => candidate.id === this.deps.goalId && !candidate.archived,
      );
      this.setState({
        activities: catalog.activities,
        goal: goal ?? null,
        ...(goal ? this.draftOf(goal) : {}),
      });
    });
  }

  get isBusy(): boolean {
    return this.state.action !== null;
  }

  /** True when the form differs from the saved goal. */
  get isDirty(): boolean {
    const { goal } = this.state;
    if (!goal) {
      return false;
    }
    const saved = this.draftOf(goal);
    const draft = this.state;
    return (
      draft.name !== saved.name ||
      draft.activityId !== saved.activityId ||
      draft.materialIcon !== saved.materialIcon ||
      draft.repeatType !== saved.repeatType ||
      draft.weekdaysMask !== saved.weekdaysMask ||
      draft.targetPerWeek !== saved.targetPerWeek
    );
  }

  setName({ name }: { name: string }): void {
    this.setState({ name });
  }

  setRepeat({ repeatType }: { repeatType: "daily" | "weekly" }): void {
    this.setState({ repeatType });
  }

  setActivity({ activityId }: { activityId: string | null }): void {
    this.setState({ activityId });
  }

  toggleWeekday({ index }: { index: number }): void {
    this.setState({ weekdaysMask: this.state.weekdaysMask ^ (1 << index) });
  }

  setTarget({ targetPerWeek }: { targetPerWeek: number }): void {
    this.setState({ targetPerWeek });
  }

  openIconPicker(): void {
    this.setState({ iconPickerOpen: true });
  }

  closeIconPicker(): void {
    this.setState({ iconPickerOpen: false });
  }

  chooseIcon({ icon }: { icon: string }): void {
    this.setState({ materialIcon: icon, iconPickerOpen: false });
  }

  /** True when the owner can leave. The page waits while a request runs. */
  canLeave(): boolean {
    if (!this.isBusy) {
      return true;
    }
    this.setState({
      notice: {
        kind: "info",
        text: "Wait for the goal update to finish before leaving this goal.",
      },
    });
    return false;
  }

  async save(): Promise<void> {
    const { goal } = this.state;
    const draft = this.state;
    if (!goal || this.isBusy) {
      return;
    }
    const name = draft.name.trim();
    if (!name) {
      this.fail("Goal name is required.");
      return;
    }
    if (
      draft.repeatType === "daily" &&
      (draft.weekdaysMask < 1 || draft.weekdaysMask > ALL_WEEKDAYS_MASK)
    ) {
      this.fail("Choose at least one weekday for a daily goal.");
      return;
    }
    if (
      draft.repeatType === "weekly" &&
      (draft.targetPerWeek < 1 || draft.targetPerWeek > 7)
    ) {
      this.fail("Choose between 1 and 7 days per week.");
      return;
    }
    if (!this.deps.services.device.isOnline()) {
      this.fail(OFFLINE);
      return;
    }
    this.setState({ action: "save", notice: null });
    try {
      const saved = await this.plugins.requests.patchGoal({
        id: goal.id,
        patch: {
          name,
          activityId: draft.activityId,
          materialIcon: draft.materialIcon,
          repeatType: draft.repeatType,
          scheduleType:
            draft.repeatType === "weekly"
              ? "times_per_week"
              : draft.weekdaysMask === ALL_WEEKDAYS_MASK
                ? "daily"
                : "weekdays",
          targetPerWeek:
            draft.repeatType === "weekly" ? draft.targetPerWeek : null,
          weekdaysMask:
            draft.repeatType === "daily" ? draft.weekdaysMask : null,
        },
      });
      this.setState({
        goal: saved,
        ...this.draftOf(saved),
        notice: { kind: "success", text: "Goal updated." },
      });
      this.deps.catalogEvents.emitDetached({ type: "catalogChanged" });
    } catch (error) {
      this.fail(`${failureMessage(error)} The goal was restored.`);
    } finally {
      this.setState({ action: null });
    }
  }

  /** True when the goal is archived, and the page closes. */
  async archive(): Promise<boolean> {
    return this.retire({
      action: "archive",
      notice: (goal) => `Archived “${goal.name}”. You can restore it in Setup.`,
      send: (goal) =>
        this.plugins.requests
          .patchGoal({ id: goal.id, patch: { archived: true } })
          .then(() => undefined),
    });
  }

  /** True when the goal is deleted after the owner agrees, and the page closes. */
  async remove(): Promise<boolean> {
    const { goal } = this.state;
    if (
      !goal ||
      !this.deps.services.dialogs.confirm(
        deleteWarning({ kind: "goal", name: goal.name }),
      )
    ) {
      return false;
    }
    return this.retire({
      action: "delete",
      notice: (deleted) => `Deleted “${deleted.name}”.`,
      send: (deleted) =>
        this.plugins.requests.remove({ kind: "goal", id: deleted.id }),
    });
  }

  private draftOf(goal: Goal) {
    return {
      name: goal.name,
      activityId: goal.activityId,
      repeatType: goalRepeatType(goal),
      weekdaysMask: goalWeekdayMask(goal),
      targetPerWeek: Math.min(7, Math.max(1, goal.targetPerWeek ?? 1)),
      materialIcon: goal.materialIcon,
    };
  }

  private fail(text: string): void {
    this.setState({ notice: { kind: "error", text } });
  }

  /** Archive and delete both take the goal out of the active goals. */
  private async retire({
    action,
    notice,
    send,
  }: {
    action: "archive" | "delete";
    notice: (goal: Goal) => string;
    send: (goal: Goal) => Promise<void>;
  }): Promise<boolean> {
    const { goal } = this.state;
    if (!goal || this.isBusy) {
      return false;
    }
    if (!this.deps.services.device.isOnline()) {
      this.fail(OFFLINE);
      return false;
    }
    this.setState({ action, notice: null });
    try {
      await send(goal);
    } catch (error) {
      this.setState({ action: null });
      this.fail(failureMessage(error));
      return false;
    }
    this.setState({ action: null });
    this.deps.catalogEvents.emitDetached({
      type: "catalogChanged",
      notice: { target: this.deps.returnTo, text: notice(goal) },
    });
    return true;
  }
}
