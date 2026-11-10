import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useLogic } from "../../core/logic/use-logic.js";
import { useFrontendApp } from "../../core/ui/frontend-app-context.js";
import { ThemeLogic } from "./theme-logic.js";
import "./settings.css";

interface ThemeContextValue {
  logic: ThemeLogic;
  state: ThemeLogic["state"];
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Owns the theme of this device for the life of the page, so that every page, also the sign-in page, shows it. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const app = useFrontendApp();
  const deps = useMemo(
    () => ({
      storage: { settings: app.storage.settings },
      services: { theme: app.services.theme },
      api: {},
    }),
    [app],
  );
  const value = useLogic({ LogicClass: ThemeLogic, deps });
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }
  return value;
}
