import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useLogic } from "../logic/use-logic.js";
import { useFrontendApp } from "./frontend-app-context.js";
import { NavigationLockLogic } from "./navigation-lock-logic.js";

interface NavigationLockContextValue {
  logic: NavigationLockLogic;
  state: NavigationLockLogic["state"];
}

const NavigationLockContext = createContext<NavigationLockContextValue | null>(
  null,
);

/** Owns the navigation lock above the pages, so that each page can hold it. */
export function NavigationLockProvider({ children }: { children: ReactNode }) {
  const app = useFrontendApp();
  const deps = useMemo(
    () => ({
      storage: {},
      services: { history: app.services.history },
      api: {},
      navigationLockEvents: app.navigationLockEvents,
      pageNoticeEvents: app.pageNoticeEvents,
    }),
    [app],
  );
  const value = useLogic({ LogicClass: NavigationLockLogic, deps });
  return (
    <NavigationLockContext.Provider value={value}>
      {children}
    </NavigationLockContext.Provider>
  );
}

export function useNavigationLock(): NavigationLockContextValue {
  const value = useContext(NavigationLockContext);
  if (!value) {
    throw new Error(
      "useNavigationLock must be used inside NavigationLockProvider",
    );
  }
  return value;
}
