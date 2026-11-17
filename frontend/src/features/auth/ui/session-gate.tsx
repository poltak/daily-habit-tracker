import { Navigate, Outlet, useLocation } from "react-router";
import { AppShell } from "../../core/ui/app-shell.js";
import { JournalLoadingShell } from "../../core/ui/journal-loading-shell.js";
import { useAuth } from "./auth-context.js";
export function SessionGate() {
  const { logic, state } = useAuth();
  const location = useLocation();
  if (state.isSignedIn) {
    return <Outlet />;
  }
  if (
    state.loadSessionState === "pristine" ||
    state.loadSessionState === "running"
  ) {
    // The old site checked the session on the server and sent this shell at
    // once, so the check shows the same frame as the first load of the data.
    return (
      <AppShell view="log" connection="checking" onOpen={() => {}}>
        <JournalLoadingShell view="log" />
      </AppShell>
    );
  }
  if (state.loadSessionState === "error") {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <h1>Unable to check your session</h1>
          <p className="auth-error" role="alert">
            {state.loadSessionError}
          </p>
          <div className="auth-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => void logic.refresh()}
            >
              Try again
            </button>
          </div>
        </section>
      </main>
    );
  }
  return (
    <Navigate
      to="/sign-in"
      replace
      state={
        // The sign-out makes the session end before its task ends, so a
        // running sign-out must not keep the page as the return address. A
        // failed sign-out keeps the session, so a later expiry keeps the page.
        state.signOutState !== "running" && state.signOutState !== "success"
          ? { returnTo: location.pathname + location.search + location.hash }
          : undefined
      }
    />
  );
}
