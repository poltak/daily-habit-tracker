import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useLogic } from "../logic/use-logic.js";
import { useFrontendApp } from "./frontend-app-context.js";
import { PageNoticeLogic } from "./page-notice-logic.js";

interface PageNoticeContextValue {
  logic: PageNoticeLogic;
  state: PageNoticeLogic["state"];
}

const PageNoticeContext = createContext<PageNoticeContextValue | null>(null);

/** Owns the message slot above the pages, so the shell can show what a page sent. */
export function PageNoticeProvider({ children }: { children: ReactNode }) {
  const app = useFrontendApp();
  const deps = useMemo(
    () => ({
      storage: {},
      services: {},
      api: {},
      pageNoticeEvents: app.pageNoticeEvents,
    }),
    [app],
  );
  const value = useLogic({ LogicClass: PageNoticeLogic, deps });
  return (
    <PageNoticeContext.Provider value={value}>
      {children}
    </PageNoticeContext.Provider>
  );
}

export function usePageNotice(): PageNoticeContextValue {
  const value = useContext(PageNoticeContext);
  if (!value) {
    throw new Error("usePageNotice must be used inside PageNoticeProvider");
  }
  return value;
}
