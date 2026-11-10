import { useMemo } from "react";
import {
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router";
import { AuthProvider, useAuth } from "../../auth/ui/auth-context.js";
import { AddActivityPage } from "../../catalog/ui/add-activity-page.js";
import {
  CatalogSections,
  CatalogSetupNotice,
} from "../../catalog/ui/catalog-sections.js";
import { CatalogSetupProvider } from "../../catalog/ui/catalog-setup-context.js";
import { GoalSettings } from "../../catalog/ui/goal-settings.js";
import { AccountSection } from "../../auth/ui/account-section.js";
import { SessionGate } from "../../auth/ui/session-gate.js";
import { SignInPage } from "../../auth/ui/sign-in-page.js";
import { GoalPage } from "../../goals/ui/goal-page.js";
import { CalendarPage } from "../../days/ui/calendar-page.js";
import { JournalProvider, useJournal } from "../../days/ui/journal-context.js";
import {
  LogDateActions,
  LogDateSwitcher,
} from "../../days/ui/log-date-switcher.js";
import { LogPage } from "../../days/ui/log-page.js";
import { InsightsPage } from "../../insights/ui/insights-page.js";
import { ThemeProvider } from "../../settings/ui/settings-context.js";
import { SetupPage } from "../../settings/ui/setup-page.js";
import { WeekLogic } from "../../settings/ui/week-logic.js";
import { useLogic, useLogicInstance } from "../logic/use-logic.js";
import { AppShell, type NavView, type ShellView } from "./app-shell.js";
import { useFrontendApp } from "./frontend-app-context.js";
import { ErrorBoundary } from "./error-boundary.js";
import { PageErrorFallback } from "./error-fallbacks.js";
import type { ProtectedPageContext } from "./signed-in-user.js";

/** The sign-in page was at `/login`. Old links and bookmarks still arrive there. */
function LoginRedirect() {
  const location = useLocation();
  return (
    <Navigate
      to={{ pathname: "/sign-in", search: location.search }}
      replace
      state={location.state}
    />
  );
}

const VIEW_TITLES: Record<ShellView, string> = {
  log: "Your journal",
  calendar: "Your calendar",
  insights: "Your insights",
  settings: "Your setup",
  goal: "Goal history",
};

/** The address that opens each page. The old site kept the page in `?view=`. */
const VIEW_PATHS: Record<NavView, string> = {
  log: "/",
  calendar: "/?view=calendar",
  insights: "/insights",
  settings: "/?view=settings",
};

/** The page that an address opens, or `null` when no page has the address. */
function viewOfAddress({
  pathname,
  search,
}: {
  pathname: string;
  search: URLSearchParams;
}): ShellView | null {
  if (pathname.replace(/\/$/, "") === "/insights") {
    return "insights";
  }
  if (pathname !== "/") {
    return null;
  }
  const requested = search.get("view");
  if (requested === "goal" && search.get("goal")) {
    return "goal";
  }
  if (requested === "calendar" || requested === "entries") {
    return "calendar";
  }
  return requested === "settings" || requested === "insights"
    ? (requested as ShellView)
    : "log";
}

/** The pages that open from another page. They have no button in the navigation. */
function subViewOfAddress({
  pathname,
  search,
}: {
  pathname: string;
  search: URLSearchParams;
}): "add-activity" | null {
  return pathname === "/" && search.get("view") === "add-activity"
    ? "add-activity"
    : null;
}

const ADD_ACTIVITY_TITLE = "Add activity";

/** The header and the navigation around the page in the outlet. */
function JournalFrame() {
  const { logic: auth } = useAuth();
  const { logic, state } = useJournal();
  const catalog = useLogicInstance(logic.plugins.catalog);
  const location = useLocation();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const subView = subViewOfAddress({ pathname: location.pathname, search });
  const view = subView
    ? null
    : viewOfAddress({ pathname: location.pathname, search });
  // The session gate renders this layout only for a signed-in user.
  const pageContext = useMemo<ProtectedPageContext>(
    () => ({ authEvents: auth.events }),
    [auth.events],
  );
  // The sky takes the colour of the mood of the open day.
  const dayColor =
    view === "log"
      ? catalog.moods.find((mood) => mood.id === state.draft.moodId)?.color
      : undefined;
  return (
    <AppShell
      view={view}
      title={
        view === "log" ? (
          <LogDateSwitcher />
        ) : subView ? (
          ADD_ACTIVITY_TITLE
        ) : (
          VIEW_TITLES[view ?? "log"]
        )
      }
      actions={view === "log" ? <LogDateActions /> : null}
      connection={state.connection}
      dayColor={dayColor}
      onOpen={(next) => navigate(VIEW_PATHS[next])}
    >
      {/* A page that fails leaves the header usable. Navigation clears the failure. */}
      <ErrorBoundary resetKey={location.key} Fallback={PageErrorFallback}>
        <Outlet context={pageContext} />
      </ErrorBoundary>
    </AppShell>
  );
}

/** Go back to the page that opened this one. A page opened from outside goes to `fallback`. */
function useGoBack(fallback: string): () => void {
  const location = useLocation();
  const navigate = useNavigate();
  return () =>
    location.key === "default"
      ? navigate(fallback, { replace: true })
      : navigate(-1);
}

/** The goal page, with the catalog and the open day of the log. */
function GoalRoute({
  goalId,
  weekEndsOn,
}: {
  goalId: string;
  weekEndsOn: number;
}) {
  const { logic, state } = useJournal();
  const catalog = useLogicInstance(logic.plugins.catalog);
  const location = useLocation();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  if (catalog.loadCatalogState === "error") {
    return (
      <div className="journal-loading">
        <div className="notice error" role="alert">
          <p>{catalog.loadCatalogError}</p>
          <button
            type="button"
            className="loading-retry"
            onClick={() => void logic.loadJournal()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }
  // A reload after a change keeps the page, so its settings keep their notice.
  if (catalog.moods.length === 0 || !state.selectedDate) {
    return (
      <div className="journal-loading" aria-busy="true">
        <output className="sr-only">Loading goal…</output>
      </div>
    );
  }
  const goBack = () =>
    // The page that opened the goal is one step back. A goal opened by its address has none.
    location.key === "default"
      ? navigate("/", { replace: true })
      : navigate(-1);
  return (
    <GoalPage
      goal={catalog.goals.find((goal) => goal.id === goalId && !goal.archived)}
      settings={
        <GoalSettings
          goalId={goalId}
          returnTo={search.get("from") === "settings" ? "settings" : "log"}
          onClose={goBack}
        />
      }
      initialMonth={state.selectedDate.slice(0, 7)}
      weekEndsOn={weekEndsOn}
      onBack={goBack}
    />
  );
}

/** The pages that share the address `/`, told apart by `?view=`. */
function JournalViews() {
  const location = useLocation();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const openedFromSetup = search.get("from") === "settings";
  const goBack = useGoBack(openedFromSetup ? "/?view=settings" : "/");
  const app = useFrontendApp();
  const weekDeps = useMemo(
    () => ({ storage: {}, services: {}, api: { settings: app.api.settings } }),
    [app],
  );
  // The calendar, the goal page and Insights group days into weeks that end on the stored day.
  const weekEndsOn = useLogic({ LogicClass: WeekLogic, deps: weekDeps }).state
    .weekEndsOn;
  const subView = subViewOfAddress({ pathname: location.pathname, search });
  if (subView === "add-activity") {
    return (
      <AddActivityPage
        requestedGroupId={search.get("group") ?? undefined}
        returnTo={openedFromSetup ? "settings" : "log"}
        onClose={goBack}
      />
    );
  }
  const view = viewOfAddress({ pathname: location.pathname, search });
  if (view === "calendar") {
    return <CalendarPage weekEndsOn={weekEndsOn} />;
  }
  if (view === "goal") {
    return (
      <GoalRoute goalId={search.get("goal") ?? ""} weekEndsOn={weekEndsOn} />
    );
  }
  if (view === "settings") {
    return (
      <SetupPage
        account={<AccountSection />}
        catalogNotice={<CatalogSetupNotice />}
        catalog={
          <CatalogSections
            onAddActivity={(groupId) =>
              navigate(
                `/?view=add-activity&group=${encodeURIComponent(groupId)}&from=settings`,
              )
            }
            onConfigureGoal={(goalId) =>
              navigate(
                `/?view=goal&goal=${encodeURIComponent(goalId)}&from=settings`,
              )
            }
          />
        }
      />
    );
  }
  if (view === "insights") {
    return <InsightsPage weekEndsOn={weekEndsOn} />;
  }
  return (
    <LogPage
      onOpenGoal={(goalId) =>
        navigate(`/?view=goal&goal=${encodeURIComponent(goalId)}`)
      }
      onAddActivity={(groupId) =>
        navigate(
          `/?view=add-activity&group=${encodeURIComponent(groupId)}&from=log`,
        )
      }
    />
  );
}

function NotFoundPage() {
  return (
    <section className="page-section">
      <div className="page-intro">
        <h1>Page not found</h1>
        <p className="muted">This page could not be found.</p>
      </div>
    </section>
  );
}

/** Router-agnostic composition: BrowserRouter in live, MemoryRouter in tests. */
export function AppRoutes() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Routes>
          <Route
            path="/sign-in"
            element={
              <div className="app-shell">
                <SignInPage />
              </div>
            }
          />
          <Route path="/login" element={<LoginRedirect />} />
          <Route element={<SessionGate />}>
            <Route
              element={
                <JournalProvider>
                  <CatalogSetupProvider>
                    <JournalFrame />
                  </CatalogSetupProvider>
                </JournalProvider>
              }
            >
              <Route path="/" element={<JournalViews />} />
              <Route path="/insights" element={<JournalViews />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  );
}
