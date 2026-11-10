import type { Unsubscribe } from "@app/common/features/core/events/event-emitter";

/** What the browser tells about the page: the connection, and whether the page is in view. */
export interface DeviceServiceInterface {
  isOnline(): boolean;
  /** True when the page is in the foreground. */
  isVisible(): boolean;
  /** Calls `listener` when the connection or the visibility changes. */
  listen(listener: () => void): Unsubscribe;
  /**
   * Ask the browser to question the owner before the page closes. A page with
   * a save in progress turns it on.
   */
  setLeaveWarning(active: boolean): void;
}
