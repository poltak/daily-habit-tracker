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
import { SessionGate } from "../../auth/ui/session-gate.js";
import { SignInPage } from "../../auth/ui/sign-in-page.js";
import { CalendarPage } from "../../days/ui/calendar-page.js";
import { JournalProvider, useJournal } from "../../days/ui/journal-context.js";
import {
  LogDateActions,
  LogDateSwitcher,
} from "../../days/ui/log-date-switcher.js";
import { LogPage } from "../../days/ui/log-page.js";
import { InsightsPage } from "../../insights/ui/insights-page.js";
import { useLogicInstance } from "../logic/use-logic.js";
import { AppShell, type ShellView } from "./app-shell.js";
import { ErrorBoundary } from "./error-boundary.js";
import { PageErrorFallback } from "./error-fallbacks.js";
import { SetupPlaceholder } from "./placeholder-pages.js";
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
};

/** The address that opens each page. The old site kept the page in `?view=`. */
const VIEW_PATHS: Record<ShellView, string> = {
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
  if (requested === "calendar" || requested === "entries") {
    return "calendar";
  }
  return requested === "settings" || requested === "insights"
    ? (requested as ShellView)
    : "log";
}

/** The header and the navigation around the page in the outlet. */
function JournalFrame() {
  const { logic: auth } = useAuth();
  const { logic, state } = useJournal();
  const catalog = useLogicInstance(logic.plugins.catalog);
  const location = useLocation();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const view = viewOfAddress({ pathname: location.pathname, search });
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
      title={view === "log" ? <LogDateSwitcher /> : VIEW_TITLES[view ?? "log"]}
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

/** The pages that share the address `/`, told apart by `?view=`. */
function JournalViews() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const view = viewOfAddress({ pathname: location.pathname, search });
  if (view === "calendar") {
    // The day on which a week ends comes from the setup page of a later phase.
    return <CalendarPage weekEndsOn={0} />;
  }
  if (view === "settings") {
    return (
      <SetupPlaceholder
        signingOut={auth.state.signOutState === "running"}
        signOutError={auth.state.signOutError}
        onSignOut={() => void auth.logic.signOut()}
      />
    );
  }
  if (view === "insights") {
    // The day on which a week ends comes from the setup page of a later phase.
    return <InsightsPage weekEndsOn={0} />;
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
                <JournalFrame />
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
  );
}
