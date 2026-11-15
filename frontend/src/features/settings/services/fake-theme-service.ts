import type { Unsubscribe } from "@app/common/features/core/events/event-emitter";
import type { ThemeServiceInterface } from "./types.js";
import type { ThemePreference } from "../utils/theme.js";

/** Records the themes that the page showed. */
export class FakeThemeService implements ThemeServiceInterface {
  readonly applied: ThemePreference[] = [];
  private readonly listeners = new Set<(key: string | null) => void>();

  apply(preference: ThemePreference): void {
    this.applied.push(preference);
  }

  listenToOtherTabs(listener: (key: string | null) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Another tab changed `key` in the storage, or cleared it with `null`. */
  changeInOtherTab({ key }: { key: string | null }): void {
    for (const listener of Array.from(this.listeners)) {
      listener(key);
    }
  }
}
