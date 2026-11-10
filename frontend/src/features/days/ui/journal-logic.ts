import { Logic, type TaskState } from "@app/common/features/core/logic/logic";
import {
  addDays,
  formatLogicalDate,
  isLogicalDate,
  logicalDateInTimeZone,
} from "@app/common/features/core/utils/logical-date";
import type { DayState, Entry } from "@app/common/features/days/types";
import { LatestRequest } from "../../core/logic/latest-request.js";
import { CatalogReadPlugin } from "./catalog-read-plugin.js";
import { SelectionPlugin, type Outcome } from "./selection-plugin.js";
import { DateSwipePlugin } from "./date-swipe-plugin.js";
import { EntryActionsPlugin } from "./entry-actions-plugin.js";
import type { FrontendLogicProps } from "../../core/logic/types.js";
import type { App } from "../../core/types.js";
import type { ConnectionState, Notice } from "../types.js";
import {
  applyActivityResult,
  planActivityChange,
  undoActivityChange,
} from "../utils/selection-change.js";
import {
  draftFromDayState,
  draftFromEntry,
  draftMatchesEntry,
  emptyDraft,
  sameDraft,
  type Draft,
} from "../utils/draft.js";
import { recoverDraft } from "../utils/recover-draft.js";
import { fetchDayState } from "../utils/fetch-day-state.js";
import { planGoalChange } from "../utils/goal-change.js";
import {
  errorNotice,
  infoNotice,
  OFFLINE_DELETE,
  OFFLINE_GOAL,
  OFFLINE_SAVE,
  PICK_MOOD,
  WAIT_BEFORE_DELETE,
  WAIT_BEFORE_SAVE,
  WAIT_FOR_ENTRY,
  WAIT_FOR_SELECTION,
} from "../utils/journal-messages.js";

type JournalProps = FrontendLogicProps<
  "days",
  "clock" | "dialogs" | "device" | "timers" | "windowFocus",
  "catalog" | "entries" | "day-selections" | "goal-completions"
> &
  Pick<App, "catalogEvents">;

const REFRESH_INTERVAL_MS = 15_000;
const LOCAL_DAY_INTERVAL_MS = 60_000;

export interface JournalState {
  today: string;
  yesterday: string;
  selectedDate: string;
  /** The day whose state is in `draft`. */
  loadedDate: string;
  entry: Entry | null;
  draft: Draft;
  activityQuery: string;
  openGroupIds: string[];
  notice: Notice | null;
  connection: ConnectionState;
  loadDayState: TaskState;
  loadDayError: string | null;
  refreshDayState: TaskState;
  refreshDayError: string | null;
}

/**
 * The log of the journal. The app owns one for the whole session, so the open
 * day and the search stay when the owner opens another page and comes back.
 */
export class JournalLogic extends Logic<
  JournalProps,
  JournalState,
  never,
  {
    catalog: CatalogReadPlugin;
    entryActions: EntryActionsPlugin;
    selection: SelectionPlugin;
    swipe: DateSwipePlugin;
  }
> {
  private readonly dayRefreshes = new LatestRequest(this.signal);
  // True while the choices of the open day are on this device only.
  private hasLocalDraft = false;
  // Counts the changes of the owner, so that a refresh does not undo one.
  private localMutationEpoch = 0;

  constructor(deps: JournalProps) {
    const today = logicalDateInTimeZone({
      now: deps.services.clock.now(),
      timeZone: deps.services.clock.timeZone(),
    });
    super({
      deps,
      plugins: {
        catalog: (pluginDeps) => new CatalogReadPlugin(pluginDeps),
        entryActions: (pluginDeps) => new EntryActionsPlugin(pluginDeps),
        selection: (pluginDeps) => new SelectionPlugin(pluginDeps),
        swipe: () => new DateSwipePlugin(),
      },
      initialState: {
        today,
        yesterday: addDays(today, -1),
        selectedDate: "",
        loadedDate: "",
        entry: null,
        draft: emptyDraft(),
        activityQuery: "",
        openGroupIds: [],
        notice: null,
        connection: "checking",
        loadDayState: "pristine",
        loadDayError: null,
        refreshDayState: "pristine",
        refreshDayError: null,
      },
    });
  }

  protected override async onInitialize(): Promise<void> {
    const { timers, windowFocus, device } = this.deps.services;
    this.registerCleanup(
      timers.every({
        intervalMs: LOCAL_DAY_INTERVAL_MS,
        listener: () => this.updateLocalDay(),
      }),
    );
    this.registerCleanup(
      timers.every({
        intervalMs: REFRESH_INTERVAL_MS,
        listener: () => void this.refreshDay(),
      }),
    );
    this.registerCleanup(windowFocus.listen(() => this.refreshOnReturn()));
    this.listen(this.deps.catalogEvents, async ({ notice }) => {
      await this.plugins.catalog.load();
      await this.refreshDay();
      if (notice?.target === "log") {
        this.setState({ notice: { kind: "success", text: notice.text } });
      }
    });
    this.registerCleanup(
      device.listen(() => {
        this.setState({ connection: device.isOnline() ? "online" : "offline" });
        this.refreshOnReturn();
      }),
    );
    await this.loadJournal();
  }

  /** Load the catalog, then open the day that the owner left open, or today. */
  async loadJournal(): Promise<void> {
    this.setState({ connection: "checking", notice: null });
    const { catalog } = this.plugins;
    if (!(await catalog.load())) {
      this.setState({
        connection: this.offlineOrError(),
        notice: errorNotice(
          catalog.state.loadCatalogError ??
            "Could not connect to your journal.",
        ),
      });
      return;
    }
    this.setState({ connection: "online" });
    if (!this.state.selectedDate) {
      const today = this.localToday();
      const remembered = this.deps.storage.days.readRememberedDate();
      await this.chooseDate({
        logicalDate: remembered && remembered <= today ? remembered : today,
      });
    }
  }

  setActivityQuery({ query }: { query: string }): void {
    // The end of a search closes every group.
    const searchEnded =
      query.trim() === "" && this.state.activityQuery.trim() !== "";
    this.setState({
      activityQuery: query,
      ...(searchEnded ? { openGroupIds: [] } : {}),
    });
  }

  setGroupOpen({ groupId, open }: { groupId: string; open: boolean }): void {
    const others = this.state.openGroupIds.filter((id) => id !== groupId);
    this.setState({ openGroupIds: open ? [...others, groupId] : others });
  }

  /** Open a day. A day that has not started, or that is not a date, changes nothing. */
  async chooseDate({ logicalDate }: { logicalDate: string }): Promise<void> {
    const { storage } = this.deps;
    if (!isLogicalDate(logicalDate) || logicalDate > this.localToday()) {
      return;
    }
    if (this.state.loadDayState === "running") {
      return;
    }
    if (this.plugins.entryActions.isRunning) {
      this.setState({ notice: infoNotice(WAIT_FOR_ENTRY) });
      return;
    }
    if (this.plugins.selection.isRunning) {
      this.setState({ notice: infoNotice(WAIT_FOR_SELECTION) });
      return;
    }
    this.dayRefreshes.cancel();
    this.hasLocalDraft = false;
    storage.days.rememberDate({ logicalDate });
    this.setState({
      loadedDate: "",
      entry: null,
      draft: emptyDraft(),
      selectedDate: logicalDate,
      notice: null,
    });
    await this.executeTask("loadDay", async () => {
      const state = await fetchDayState({
        api: this.deps.api,
        logicalDate,
        errorText: "Could not load that date.",
        signal: this.signal,
      });
      await this.openDay({ logicalDate, state });
    });
    if (this.state.loadDayState === "error") {
      this.setState({
        connection: this.offlineOrError(),
        notice: errorNotice(
          this.state.loadDayError ?? "Could not load that date.",
        ),
      });
    }
  }

  /** Put the day of the server on the form, with the draft from this device on top. */
  private async openDay({
    logicalDate,
    state,
  }: {
    logicalDate: string;
    state: DayState;
  }): Promise<void> {
    const { storage } = this.deps;
    const { entryActions } = this.plugins;
    const opened = recoverDraft({
      storage: storage.days,
      logicalDate,
      state,
      catalog: this.plugins.catalog,
    });
    let { draft } = opened;
    let entry = state.entry;
    let recoveryError: string | null = null;
    if (entry && opened.restored) {
      // The draft has choices that the server lacks, so save them now.
      const saved = draftMatchesEntry(draft, entry)
        ? entry
        : await entryActions.save({ logicalDate, draft });
      if (saved) {
        storage.days.clearDraft({ logicalDate });
        entry = saved;
        draft = draftFromEntry(saved);
      } else {
        draft = draftFromEntry(entry);
        recoveryError = `Could not restore your last choice. ${entryActions.state.saveError}`;
      }
    }
    this.hasLocalDraft = opened.restored && !state.entry;
    this.setState({
      draft,
      entry,
      loadedDate: logicalDate,
      connection: recoveryError ? this.offlineOrError() : "online",
      notice: recoveryError ? errorNotice(recoveryError) : null,
    });
  }

  /**
   * Read the open day again, so that a change from another device shows up.
   * It waits while this device has a change of its own that is not stored.
   */
  async refreshDay(): Promise<void> {
    const { device } = this.deps.services;
    const logicalDate = this.state.selectedDate;
    if (!device.isVisible() || !device.isOnline() || !logicalDate) {
      return;
    }
    const mutationEpoch = this.localMutationEpoch;
    const isRelevant = (signal: AbortSignal) =>
      !signal.aborted &&
      device.isVisible() &&
      this.state.loadedDate === logicalDate &&
      this.localMutationEpoch === mutationEpoch &&
      !this.isBusyWithChange();
    if (this.state.loadedDate !== logicalDate || this.isBusyWithChange()) {
      return;
    }
    await this.executeTask("refreshDay", async () => {
      const signal = this.dayRefreshes.start();
      const state = await fetchDayState({
        api: this.deps.api,
        logicalDate,
        errorText: "Could not refresh that date.",
        signal,
      });
      if (!isRelevant(signal)) {
        return;
      }
      const draft = draftFromDayState(state);
      this.setState({
        draft: sameDraft(this.state.draft, draft) ? this.state.draft : draft,
        entry: state.entry,
        connection: "online",
      });
    });
    if (this.state.refreshDayState === "error" && !this.signal.aborted) {
      this.setState({ connection: this.offlineOrError() });
    }
  }

  /** Tap a mood. The server keeps it at once, also before the day is saved. */
  async toggleMood({ moodId }: { moodId: string }): Promise<void> {
    const { selectedDate: logicalDate, draft } = this.state;
    if (!this.canChangeSelection() || draft.moodId === moodId) {
      return;
    }
    await this.changeSelection({
      nextDraft: { ...draft, moodId },
      undo: (current) => ({ ...current, moodId: draft.moodId }),
      failure: "The mood was restored.",
      send: () => this.plugins.selection.chooseMood({ logicalDate, moodId }),
      apply: (current) => ({
        draft: current,
        entry: this.state.entry && { ...this.state.entry, moodId },
      }),
    });
  }

  async toggleActivity({ activityId }: { activityId: string }): Promise<void> {
    const { selectedDate: logicalDate, draft } = this.state;
    if (!this.canChangeSelection()) {
      return;
    }
    const change = planActivityChange({
      draft,
      goals: this.plugins.catalog.state.goals,
      activityId,
    });
    await this.changeSelection({
      nextDraft: change.nextDraft,
      undo: (current) =>
        undoActivityChange({ draft: current, undo: change.undo }),
      failure: "The activity was restored.",
      send: () =>
        this.plugins.selection.chooseActivity({
          logicalDate,
          activityId,
          selected: change.selected,
          linkedGoalIds: change.linkedGoalIds,
        }),
      apply: (current, result) => ({
        draft: applyActivityResult({ target: current, result }),
        entry:
          this.state.entry &&
          applyActivityResult({ target: this.state.entry, result }),
      }),
    });
  }

  /** Tap the switch of a goal. Its activity and shared goals follow. */
  async toggleGoal({ goalId }: { goalId: string }): Promise<void> {
    const { selectedDate: logicalDate, draft } = this.state;
    const goals = this.plugins.catalog.state.goals;
    const change = planGoalChange({ draft, goals, goalId });
    if (!change || !this.canChangeSelection()) {
      return;
    }
    if (!this.deps.services.device.isOnline()) {
      this.setState({
        connection: "offline",
        notice: errorNotice(OFFLINE_GOAL),
      });
      return;
    }
    await this.changeSelection({
      nextDraft: change.nextDraft,
      undo: change.undo,
      failure: "The goal was restored.",
      send: () =>
        this.plugins.selection.chooseGoal({ logicalDate, goalId, ...change }),
      apply: (current, result) => ({
        draft: applyActivityResult({ target: current, result }),
        entry:
          this.state.entry &&
          applyActivityResult({ target: this.state.entry, result }),
      }),
    });
  }

  /**
   * Keep a tap on this device at once, ask the server to keep it, and put the
   * form back when the server cannot.
   */
  private async changeSelection<Result>({
    nextDraft,
    undo,
    failure,
    send,
    apply,
  }: {
    nextDraft: Draft;
    undo: (draft: Draft) => Draft;
    failure: string;
    send: () => Promise<Outcome<Result>>;
    apply: (
      draft: Draft,
      result: Result,
    ) => { draft: Draft; entry: Entry | null };
  }): Promise<void> {
    const { selectedDate: logicalDate } = this.state;
    const hadLocalDraft = this.hasLocalDraft;
    const { services } = this.deps;
    this.localMutationEpoch += 1;
    this.changeDraft(nextDraft);
    this.setState({ notice: null });
    services.device.setLeaveWarning(true);
    // The owner cannot open another day while the tap waits.
    const outcome = await send();
    services.device.setLeaveWarning(false);
    if (outcome.ok) {
      const next = apply(this.state.draft, outcome.result);
      this.setState({ entry: next.entry });
      this.changeDraft(next.draft);
      this.settleSaved({ logicalDate });
      return;
    }
    this.changeDraft(undo(this.state.draft));
    this.settleFailed({ logicalDate, hadLocalDraft });
    this.setState({
      connection: this.offlineOrError(),
      notice: errorNotice(`${outcome.message} ${failure}`),
    });
  }

  async saveEntry(): Promise<void> {
    const { selectedDate: logicalDate, draft } = this.state;
    const { storage, services } = this.deps;
    if (!this.canChangeEntry()) {
      return;
    }
    if (this.plugins.selection.isRunning) {
      this.setState({ notice: infoNotice(WAIT_BEFORE_SAVE) });
      return;
    }
    if (!draft.moodId) {
      this.setState({ notice: errorNotice(PICK_MOOD) });
      return;
    }
    if (!services.device.isOnline()) {
      this.setState({
        notice: errorNotice(OFFLINE_SAVE),
        connection: "offline",
      });
      return;
    }
    this.localMutationEpoch += 1;
    this.setState({ connection: "checking", notice: null });
    const { entryActions } = this.plugins;
    const entry = await entryActions.save({ logicalDate, draft });
    if (!entry) {
      this.setState({
        connection: this.offlineOrError(),
        notice: errorNotice(`${entryActions.state.saveError} Try again.`),
      });
      return;
    }
    storage.days.clearDraft({ logicalDate });
    this.hasLocalDraft = false;
    this.setState({
      entry,
      draft: draftFromEntry(entry),
      connection: "online",
      notice: {
        kind: "success",
        text: `Saved ${formatLogicalDate({ date: logicalDate, style: "short" })}.`,
      },
    });
  }

  /** Delete the saved entry of the open day, after the owner agrees. */
  async deleteEntry(): Promise<void> {
    const { selectedDate: logicalDate, draft } = this.state;
    const { storage, services } = this.deps;
    if (!this.canChangeEntry() || !draft.version) {
      return;
    }
    if (this.plugins.selection.isRunning) {
      this.setState({ notice: infoNotice(WAIT_BEFORE_DELETE) });
      return;
    }
    const day = formatLogicalDate({ date: logicalDate, style: "friendly" });
    if (!services.dialogs.confirm(`Delete the entry for ${day}?`)) {
      return;
    }
    if (!services.device.isOnline()) {
      this.setState({
        notice: errorNotice(OFFLINE_DELETE),
        connection: "offline",
      });
      return;
    }
    this.localMutationEpoch += 1;
    this.setState({ connection: "checking", notice: null });
    const { entryActions } = this.plugins;
    const deleted = await entryActions.remove({
      logicalDate,
      version: draft.version,
    });
    if (!deleted) {
      this.setState({
        connection: this.offlineOrError(),
        notice: errorNotice(
          entryActions.state.deleteError ?? "Could not delete that entry.",
        ),
      });
      return;
    }
    storage.days.clearDraft({ logicalDate });
    this.hasLocalDraft = false;
    this.setState({
      entry: null,
      draft: {
        ...emptyDraft(),
        completedGoalIds: [...this.state.draft.completedGoalIds],
      },
      connection: "online",
      notice: { kind: "success", text: "Entry deleted." },
    });
  }

  beginSwipe(start: { x: number; y: number }): void {
    this.plugins.swipe.begin(start);
  }

  moveSwipe({ x }: { x: number }): void {
    this.plugins.swipe.move({ x, canGoForward: !this.isLatestDay() });
  }

  async endSwipe(end: { x: number; y: number } | null): Promise<void> {
    const offset = this.plugins.swipe.end(end);
    const { selectedDate, loadDayState } = this.state;
    if (offset !== 0 && selectedDate && loadDayState !== "running") {
      await this.chooseDate({ logicalDate: addDays(selectedDate, offset) });
    }
  }

  isLatestDay(): boolean {
    return this.state.selectedDate >= this.state.today;
  }

  private localToday(): string {
    const { clock } = this.deps.services;
    return logicalDateInTimeZone({
      now: clock.now(),
      timeZone: clock.timeZone(),
    });
  }

  private timestamp(): string {
    return new Date(this.deps.services.clock.now()).toISOString();
  }

  private offlineOrError(): ConnectionState {
    return this.deps.services.device.isOnline() ? "error" : "offline";
  }

  private updateLocalDay(): void {
    const today = this.localToday();
    if (today !== this.state.today) {
      this.setState({ today, yesterday: addDays(today, -1) });
    }
  }

  private refreshOnReturn(): void {
    this.updateLocalDay();
    if (this.deps.services.device.isVisible()) {
      void this.refreshDay();
    }
  }

  private isBusyWithChange(): boolean {
    return (
      this.hasLocalDraft ||
      this.plugins.entryActions.isRunning ||
      this.plugins.selection.isRunning
    );
  }

  private canChangeEntry(): boolean {
    const { selectedDate, loadedDate } = this.state;
    return (
      Boolean(selectedDate) &&
      loadedDate === selectedDate &&
      !this.plugins.entryActions.isRunning
    );
  }

  private canChangeSelection(): boolean {
    return (
      this.canChangeEntry() &&
      this.state.loadDayState !== "running" &&
      !this.plugins.selection.isRunning
    );
  }

  private changeDraft(draft: Draft): void {
    this.setState({ draft });
    this.deps.storage.days.writeDraft({
      logicalDate: this.state.selectedDate,
      draft,
      savedAt: this.timestamp(),
    });
  }

  private settleSaved({ logicalDate }: { logicalDate: string }): void {
    if (!this.hasLocalDraft) {
      this.deps.storage.days.clearDraft({ logicalDate });
    }
    this.setState({ connection: "online", notice: null });
  }

  private settleFailed({
    logicalDate,
    hadLocalDraft,
  }: {
    logicalDate: string;
    hadLocalDraft: boolean;
  }): void {
    this.deps.storage.days.settleDraft({
      logicalDate,
      draft: this.state.draft,
      savedAt: this.timestamp(),
      keep: hadLocalDraft,
    });
    this.hasLocalDraft = hadLocalDraft;
  }
}
