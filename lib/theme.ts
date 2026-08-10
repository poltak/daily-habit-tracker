export const THEME_STORAGE_KEY = "daymark-theme";
export const THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";

export const THEME_PREFERENCES = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = Exclude<ThemePreference, "system">;

export function parseThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function readStoredThemePreference(storage: Pick<Storage, "getItem"> | null | undefined): ThemePreference {
  try {
    return parseThemePreference(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function resolveTheme({ preference, systemTheme }: { preference: ThemePreference; systemTheme: ResolvedTheme }): ResolvedTheme {
  return preference === "system" ? systemTheme : preference;
}

export function applyTheme({
  root,
  preference,
  systemTheme,
}: {
  root: { dataset: { theme?: string } };
  preference: ThemePreference;
  systemTheme: ResolvedTheme;
}) {
  root.dataset.theme = resolveTheme({ preference, systemTheme });
}

export const THEME_BOOTSTRAP_SCRIPT = `(function () {
  var root = document.documentElement;
  var media = typeof window.matchMedia === "function"
    ? window.matchMedia(${JSON.stringify(THEME_MEDIA_QUERY)})
    : { matches: false };
  function readPreference() {
    try {
      var value = window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
      return value === "light" || value === "dark" || value === "system" ? value : "system";
    } catch (_) {
      return "system";
    }
  }
  function apply() {
    var preference = readPreference();
    root.dataset.theme = preference === "system" ? (media.matches ? "dark" : "light") : preference;
  }
  try {
    apply();
    if (typeof media.addEventListener === "function") media.addEventListener("change", apply);
    else if (typeof media.addListener === "function") media.addListener(apply);
  } catch (_) {
    root.dataset.theme = media.matches ? "dark" : "light";
  }
})();`;
