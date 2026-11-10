import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useLogic } from "../../core/logic/use-logic.js";
import { useFrontendApp } from "../../core/ui/frontend-app-context.js";
import { JournalLogic } from "./journal-logic.js";

interface JournalContextValue {
  logic: JournalLogic;
  state: JournalLogic["state"];
}

const JournalContext = createContext<JournalContextValue | null>(null);

/**
 * Owns the log for the whole session, so that the open day and the search stay
 * when the owner opens another page and comes back.
 */
export function JournalProvider({ children }: { children: ReactNode }) {
  const app = useFrontendApp();
  const deps = useMemo(
    () => ({
      storage: { days: app.storage.days },
      services: {
        clock: app.services.clock,
        dialogs: app.services.dialogs,
        device: app.services.device,
        timers: app.services.timers,
        windowFocus: app.services.windowFocus,
      },
      api: {
        catalog: app.api.catalog,
        entries: app.api.entries,
        "day-selections": app.api["day-selections"],
        "goal-completions": app.api["goal-completions"],
      },
      catalogEvents: app.catalogEvents,
    }),
    [app],
  );
  const value = useLogic({ LogicClass: JournalLogic, deps });
  return (
    <JournalContext.Provider value={value}>{children}</JournalContext.Provider>
  );
}

export function useJournal(): JournalContextValue {
  const value = useContext(JournalContext);
  if (!value) {
    throw new Error("useJournal must be used inside JournalProvider");
  }
  return value;
}
