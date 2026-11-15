import { LogicPlugin } from "@app/common/features/core/logic/logic-plugin";
import type { Notice } from "../../days/types.js";
import type { App, PageView } from "../types.js";

export type PageNoticeProps = Pick<App, "pageNoticeEvents">;

interface PageNoticeState {
  /** The latest notice that this plugin sent. */
  shown: Notice | null;
}

/**
 * Sends the messages of the Logic that owns it to the one message slot of the
 * shell. The slot shows the newest message of all the Logic classes.
 */
export class PageNoticePlugin extends LogicPlugin<
  PageNoticeProps,
  PageNoticeState
> {
  /** The latest notice that `show` or `follow` handled, also after a `clear`. */
  private seen: Notice | null = null;

  constructor(deps: PageNoticeProps) {
    super({ deps, initialState: { shown: null } });
  }

  /** Show a notice. `view` names the page that shows it, when the owner is about to go there. */
  show({ notice, view }: { notice: Notice; view?: PageView }): void {
    this.seen = notice;
    this.setState({ shown: notice });
    this.deps.pageNoticeEvents.emitDetached({
      type: "shown",
      notice,
      ...(view ? { view } : {}),
    });
  }

  /** Empty the slot. */
  clear(): void {
    this.setState({ shown: null });
    this.deps.pageNoticeEvents.emitDetached({ type: "cleared" });
  }

  /**
   * Call it on each state change of a Logic that keeps its latest notice in
   * state. A new notice shows once. Setting the notice to `null` leaves the
   * slot as it is, because the old app emptied it only in a few places.
   */
  follow({ notice }: { notice: Notice | null }): void {
    if (notice && notice !== this.seen) {
      this.show({ notice });
    }
  }
}
