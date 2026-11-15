import type { Unsubscribe } from "@app/common/features/core/events/event-emitter";

/** The back and forward buttons of the browser. */
export interface HistoryServiceInterface {
  /**
   * Refuses each move through the history until the returned function runs.
   * The page stays as it is, and `onRefused` runs for each refused move.
   */
  guard(onRefused: () => void): Unsubscribe;
}
