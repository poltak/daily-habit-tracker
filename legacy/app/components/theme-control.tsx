"use client";

import { useEffect, useRef, useState } from "react";
import { applyTheme, readStoredThemePreference, THEME_MEDIA_QUERY, THEME_STORAGE_KEY, type ThemePreference } from "../../lib/theme";

export function useJournalTheme() {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const currentPreference = useRef<ThemePreference>("system");

  useEffect(() => {
    const media = window.matchMedia(THEME_MEDIA_QUERY);
    function apply(preference: ThemePreference) {
      currentPreference.current = preference;
      setPreference(preference);
      applyTheme({ root: document.documentElement, preference, systemTheme: media.matches ? "dark" : "light" });
    }
    function readPreference() {
      try { return readStoredThemePreference(window.localStorage); }
      catch { return "system" as const; }
    }
    function syncSystemTheme() { apply(currentPreference.current); }
    function syncStorage(event: StorageEvent) {
      if (event.key === THEME_STORAGE_KEY || event.key === null) apply(readPreference());
    }
    apply(readPreference());
    media.addEventListener("change", syncSystemTheme);
    window.addEventListener("storage", syncStorage);
    return () => {
      media.removeEventListener("change", syncSystemTheme);
      window.removeEventListener("storage", syncStorage);
    };
  }, []);

  function updatePreference(preference: ThemePreference) {
    currentPreference.current = preference;
    setPreference(preference);
    try { window.localStorage.setItem(THEME_STORAGE_KEY, preference); }
    catch { /* The selection still applies when browser storage is unavailable. */ }
    applyTheme({ root: document.documentElement, preference, systemTheme: window.matchMedia(THEME_MEDIA_QUERY).matches ? "dark" : "light" });
  }

  return { preference, updatePreference };
}
