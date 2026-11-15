import type { Unsubscribe } from "@app/common/features/core/events/event-emitter";
import type { HistoryServiceInterface } from "./types.js";

/** A history that a test moves with `goBack`. */
export class FakeHistoryService implements HistoryServiceInterface {
  private onRefused: (() => void) | null = null;

  guard(onRefused: () => void): Unsubscribe {
    this.onRefused = onRefused;
    return () => {
      if (this.onRefused === onRefused) {
        this.onRefused = null;
      }
    };
  }

  /** Press the back button. False when a guard refused the move. */
  goBack(): boolean {
    if (!this.onRefused) {
      return true;
    }
    this.onRefused();
    return false;
  }
}
