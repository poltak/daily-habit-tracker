import type { Unsubscribe } from "@app/common/features/core/events/event-emitter";

/** Repeating timers. A test root gives timers that a test fires by hand. */
export interface TimerServiceInterface {
  /** Calls `listener` every `intervalMs` milliseconds until the result is called. */
  every(input: { intervalMs: number; listener: () => void }): Unsubscribe;
}
