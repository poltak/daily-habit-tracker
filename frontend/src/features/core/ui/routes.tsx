import { APP_NAME } from "@app/common/features/core/utils/app-name";
import { useMemo } from "react";
import {
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useSearchParams,
} from "react-router";
import { AuthProvider, useAuth } from "../../auth/ui/auth-context.js";
import { AccountSection } from "../../auth/ui/account-section.js";
import { SessionGate } from "../../auth/ui/session-gate.js";
import { SignInPage } from "../../auth/ui/sign-in-page.js";
import { ThemeProvider } from "../../settings/ui/settings-context.js";
import { SetupPage } from "../../settings/ui/setup-page.js";
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

function ProtectedLayout() {
  const { logic, state } = useAuth();
  const location = useLocation();
  // The session gate renders this layout only for a signed-in user.
  const pageContext = useMemo<ProtectedPageContext>(
    () => ({ authEvents: logic.events }),
    [logic.events],
  );
  return (
    <>
      <header>
        <Link className="brand" to="/">
          {APP_NAME}
        </Link>
      </header>
      {state.signOutError && <p role="alert">{state.signOutError}</p>}
      <main>
        {/* A page that fails leaves the header usable. Navigation clears the failure. */}
        <ErrorBoundary resetKey={location.key} Fallback={PageErrorFallback}>
          <Outlet context={pageContext} />
        </ErrorBoundary>
      </main>
    </>
  );
}

/** The old address of the pages was `/?view=...`. Only Setup is built so far. */
function StartPage() {
  const [params] = useSearchParams();
  if (params.get("view") === "settings") {
    return <SetupPage account={<AccountSection />} />;
  }
  return <h1>{APP_NAME}</h1>;
}

/** Router-agnostic composition: BrowserRouter in live, MemoryRouter in tests. */
export function AppRoutes() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <div className="app-shell">
          <Routes>
            <Route path="/sign-in" element={<SignInPage />} />
            <Route path="/login" element={<LoginRedirect />} />
            <Route element={<SessionGate />}>
              <Route element={<ProtectedLayout />}>
                <Route path="/" element={<StartPage />} />
                <Route
                  path="*"
                  element={
                    <section>
                      <h1>Page not found</h1>
                      <Link to="/">Go to the start page</Link>
                    </section>
                  }
                />
              </Route>
            </Route>
          </Routes>
        </div>
      </AuthProvider>
    </ThemeProvider>
  );
}
