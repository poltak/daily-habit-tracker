import type { BrowserKeyValueStore } from "../../core/storage/types.js";
import { parseThemePreference, type ThemePreference } from "../utils/theme.js";

/** The key of the old app, so that a saved choice survives the move. `index.html` reads it also. */
const THEME_KEY = "daymark-theme";

interface SettingsStorageProps {
  store: BrowserKeyValueStore;
}

/** What the settings remember in the browser: the theme of this device. */
export class SettingsStorage {
  constructor(private readonly deps: SettingsStorageProps) {}

  readTheme(): ThemePreference {
    try {
      return parseThemePreference(this.deps.store.getItem(THEME_KEY));
    } catch {
      // The page stays usable when the browser blocks its storage.
      return "system";
    }
  }

  writeTheme({ theme }: { theme: ThemePreference }): void {
    try {
      this.deps.store.setItem(THEME_KEY, theme);
    } catch {
      // As above: the choice lasts until the page closes.
    }
  }
}
