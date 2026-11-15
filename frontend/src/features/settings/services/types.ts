import type { Unsubscribe } from "@app/common/features/core/events/event-emitter";
import type { ThemePreference } from "../utils/theme.js";

/** The look of the page. */
export interface ThemeServiceInterface {
  /** Show the theme. `system` follows the device, and keeps following it until the next call. */
  apply(preference: ThemePreference): void;
  /**
   * Calls `listener` with the key that another tab of the app changed in the
   * browser's storage, or `null` when it cleared the storage.
   */
  listenToOtherTabs(listener: (key: string | null) => void): Unsubscribe;
}
