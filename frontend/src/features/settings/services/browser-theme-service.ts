import type { ThemeServiceInterface } from "./types.js";
import type { ThemePreference } from "../utils/theme.js";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Sets `data-theme` on the root element. The script in `index.html` sets the
 * same attribute before the first paint, so keep the two the same.
 */
export class BrowserThemeService implements ThemeServiceInterface {
  private stopFollowing: (() => void) | null = null;

  apply(preference: ThemePreference): void {
    this.stopFollowing?.();
    this.stopFollowing = null;
    const root = document.documentElement;
    if (preference !== "system") {
      root.dataset["theme"] = preference;
      return;
    }
    const query = window.matchMedia(DARK_QUERY);
    const sync = () => {
      root.dataset["theme"] = query.matches ? "dark" : "light";
    };
    sync();
    query.addEventListener("change", sync);
    this.stopFollowing = () => query.removeEventListener("change", sync);
  }
}
