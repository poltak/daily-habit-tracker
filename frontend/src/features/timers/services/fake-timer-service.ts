import type { Unsubscribe } from "@app/common/features/core/events/event-emitter";
import type { TimerServiceInterface } from "./types.js";

/** Keeps its timers still. A test fires the ones with an interval by calling `fire`. */
export class FakeTimerService implements TimerServiceInterface {
  private readonly timers = new Set<{
    intervalMs: number;
    listener: () => void;
  }>();

  every(input: { intervalMs: number; listener: () => void }): Unsubscribe {
    this.timers.add(input);
    return () => this.timers.delete(input);
  }

  fire({ intervalMs }: { intervalMs: number }): void {
    for (const timer of Array.from(this.timers)) {
      if (timer.intervalMs === intervalMs) {
        timer.listener();
      }
    }
  }
}
