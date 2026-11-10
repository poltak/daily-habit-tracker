import { LogicPlugin } from "@app/common/features/core/logic/logic-plugin";
import type { TaskState } from "@app/common/features/core/logic/logic";
import type { Entry } from "@app/common/features/days/types";
import { requireApiSuccess } from "../../api/client/api-client.js";
import type { FrontendLogicProps } from "../../core/logic/types.js";
import { entryInputFromDraft, type Draft } from "../utils/draft.js";

export type EntryActionsProps = FrontendLogicProps<never, "device", "entries">;

interface EntryActionsState {
  saveState: TaskState;
  saveError: string | null;
  deleteState: TaskState;
  deleteError: string | null;
}

/**
 * The two requests that change the saved entry of a day: save and delete. The
 * Logic that owns the plugin decides when they run, and puts the result on the
 * form.
 */
export class EntryActionsPlugin extends LogicPlugin<
  EntryActionsProps,
  EntryActionsState
> {
  constructor(deps: EntryActionsProps) {
    super({
      deps,
      initialState: {
        saveState: "pristine",
        saveError: null,
        deleteState: "pristine",
        deleteError: null,
      },
    });
  }

  get isRunning(): boolean {
    return (
      this.state.saveState === "running" || this.state.deleteState === "running"
    );
  }

  /** The saved entry, or `null` when the save failed. */
  async save({
    logicalDate,
    draft,
  }: {
    logicalDate: string;
    draft: Draft;
  }): Promise<Entry | null> {
    let saved: Entry | null = null;
    this.deps.services.device.setLeaveWarning(true);
    await this.executeTask("save", async () => {
      const response = await this.deps.api.entries[":logicalDate"].$put(
        { param: { logicalDate }, json: entryInputFromDraft(draft) },
        { init: { signal: this.signal } },
      );
      await requireApiSuccess(response);
      if (response.status !== 200) {
        throw new Error("Could not save the entry.");
      }
      saved = (await response.json()).entry;
    });
    this.deps.services.device.setLeaveWarning(false);
    return saved;
  }

  /** True when the entry is deleted. */
  async remove({
    logicalDate,
    version,
  }: {
    logicalDate: string;
    version: number;
  }): Promise<boolean> {
    this.deps.services.device.setLeaveWarning(true);
    await this.executeTask("delete", async () => {
      const response = await this.deps.api.entries[":logicalDate"].$delete(
        {
          param: { logicalDate },
          query: { expectedVersion: String(version) },
        },
        { init: { signal: this.signal } },
      );
      await requireApiSuccess(response);
    });
    this.deps.services.device.setLeaveWarning(false);
    return this.state.deleteState === "success";
  }
}
