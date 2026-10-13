import { applyTheme, readStoredThemePreference, THEME_MEDIA_QUERY, THEME_STORAGE_KEY } from "../lib/theme.js";

/** @import { ThemePreference } from "../lib/theme.js" */

/**
 * Applies the stored theme and keeps it current when the system theme or another tab changes it.
 * @param {{ onChange: (preference: ThemePreference) => void }} input
 */
export function startTheme({ onChange }) {
  const media = window.matchMedia(THEME_MEDIA_QUERY);
  /** @type {ThemePreference} */
  let current = "system";

  /** @param {ThemePreference} preference */
  function apply(preference) {
    current = preference;
    onChange(preference);
    applyTheme({ root: document.documentElement, preference, systemTheme: media.matches ? "dark" : "light" });
  }
  function readPreference() {
    try {
      return readStoredThemePreference(window.localStorage);
    } catch {
      return /** @type {const} */ ("system");
    }
  }

  apply(readPreference());
  media.addEventListener("change", () => apply(current));
  window.addEventListener("storage", (event) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) apply(readPreference());
  });

  return {
    /** @param {ThemePreference} preference */
    updatePreference(preference) {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, preference);
      } catch {
        // The selection still applies when browser storage is unavailable.
      }
      apply(preference);
    },
  };
}
