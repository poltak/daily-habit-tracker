"use client";

import { useEffect, useRef, useState } from "react";
import { applyTheme, readStoredThemePreference, THEME_MEDIA_QUERY, THEME_STORAGE_KEY, type ThemePreference } from "../../lib/theme";
import { Icon } from "./icon";

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

export function ThemeControl({ preference, onChange }: { preference: ThemePreference; onChange: (preference: ThemePreference) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const options: Array<{ value: ThemePreference; label: string; icon: string }> = [
    { value: "system", label: "System", icon: "contrast" },
    { value: "light", label: "Light", icon: "light_mode" },
    { value: "dark", label: "Dark", icon: "dark_mode" },
  ];

  return (
    <div
      className="theme-control"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setMenuOpen(false);
      }}
    >
      <button
        type="button"
        className="theme-trigger"
        aria-label="Choose color theme"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        data-preference={preference}
        title="Color theme"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <Icon name={preference === "dark" ? "dark_mode" : preference === "light" ? "light_mode" : "contrast"} />
        <span className="sr-only">Choose color theme</span>
      </button>
      {menuOpen && <div className="theme-menu" role="menu" aria-label="Color theme options">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={preference === option.value ? "selected" : ""}
            role="menuitemradio"
            aria-checked={preference === option.value}
            onClick={() => {
              onChange(option.value);
              setMenuOpen(false);
            }}
          >
            <Icon name={option.icon} />
            <span>{option.label}</span>
            {preference === option.value && <Icon name="check" />}
          </button>
        ))}
      </div>}
    </div>
  );
}
