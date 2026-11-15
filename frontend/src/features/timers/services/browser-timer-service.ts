import type { Unsubscribe } from "@app/common/features/core/events/event-emitter";
import type { TimerServiceInterface } from "./types.js";

export class BrowserTimerService implements TimerServiceInterface {
  every({
    intervalMs,
    listener,
  }: {
    intervalMs: number;
    listener: () => void;
  }): Unsubscribe {
    const id = window.setInterval(listener, intervalMs);
    return () => window.clearInterval(id);
  }
}
