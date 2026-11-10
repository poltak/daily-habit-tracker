import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useLogic } from "../../core/logic/use-logic.js";
import { useFrontendApp } from "../../core/ui/frontend-app-context.js";
import { CatalogSetupLogic } from "./catalog-setup-logic.js";

interface CatalogSetupContextValue {
  logic: CatalogSetupLogic;
  state: CatalogSetupLogic["state"];
}

const CatalogSetupContext = createContext<CatalogSetupContextValue | null>(
  null,
);

/**
 * Owns the Setup catalog for the whole session. A page that changes the
 * catalog elsewhere, such as the goal page, leaves its notice here for the
 * Setup page to show.
 */
export function CatalogSetupProvider({ children }: { children: ReactNode }) {
  const app = useFrontendApp();
  const deps = useMemo(
    () => ({
      storage: {},
      services: { clock: app.services.clock, dialogs: app.services.dialogs },
      api: { catalog: app.api.catalog },
      catalogEvents: app.catalogEvents,
    }),
    [app],
  );
  const value = useLogic({ LogicClass: CatalogSetupLogic, deps });
  return (
    <CatalogSetupContext.Provider value={value}>
      {children}
    </CatalogSetupContext.Provider>
  );
}

export function useCatalogSetup(): CatalogSetupContextValue {
  const value = useContext(CatalogSetupContext);
  if (!value) {
    throw new Error("useCatalogSetup must be used inside CatalogSetupProvider");
  }
  return value;
}
