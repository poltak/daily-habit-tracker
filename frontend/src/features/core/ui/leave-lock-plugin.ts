import { LogicPlugin } from "@app/common/features/core/logic/logic-plugin";
import type { App, LeaveReason } from "../types.js";

export type LeaveLockProps = Pick<App, "navigationLockEvents"> & {
  reason: LeaveReason;
};

interface LeaveLockState {
  held: boolean;
}

let holders = 0;

/**
 * Tells the shell to hold the navigation while the Logic that owns it has a
 * request in flight. Cleanup of the Logic lets go, so an unmounted page never
 * leaves the app locked.
 */
export class LeaveLockPlugin extends LogicPlugin<
  LeaveLockProps,
  LeaveLockState
> {
  private readonly holder = `leave-lock-${(holders += 1)}`;

  constructor(deps: LeaveLockProps) {
    super({ deps, initialState: { held: false } });
  }

  /** Call it on each state change of the Logic. Only a change of `busy` sends an event. */
  update({ busy }: { busy: boolean }): void {
    if (busy === this.state.held) {
      return;
    }
    this.setState({ held: busy });
    this.deps.navigationLockEvents.emitDetached(
      busy
        ? { type: "held", holder: this.holder, reason: this.deps.reason }
        : { type: "released", holder: this.holder },
    );
  }

  protected override async onCleanup(): Promise<void> {
    if (this.state.held) {
      this.deps.navigationLockEvents.emitDetached({
        type: "released",
        holder: this.holder,
      });
    }
  }
}
