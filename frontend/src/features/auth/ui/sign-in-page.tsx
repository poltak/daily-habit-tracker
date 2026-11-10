import { APP_NAME } from "@app/common/features/core/utils/app-name";
import { useEffect } from "react";
import { Navigate, useLocation } from "react-router";
import { serverMessage } from "../utils/passkey-messages.js";
import { useAuth } from "./auth-context.js";

/**
 * Only a path on this site. Anything else could send the owner to another site
 * after sign-in. Browsers remove tabs and line breaks from addresses, and some
 * treat a backslash as a slash, so those characters are refused too.
 */
function safeReturnTo(value: unknown): string {
  return typeof value === "string" && /^\/(?![/\\])[^\s\\]*$/.test(value)
    ? value
    : "/";
}

const WAITING = "Waiting for your device…";

/** The page `/oauth/authorize` is not a page of the router: the browser must load it. */
function isServerPage(path: string): boolean {
  return path.startsWith("/oauth/");
}

function LoadServerPage({ path }: { path: string }) {
  useEffect(() => {
    // oxlint-disable-next-line no-restricted-globals -- The server draws this page, so the router cannot open it, and no Logic needs the load.
    window.location.replace(path);
  }, [path]);
  return null;
}

/**
 * The sign-in page. It signs in with a passkey, or saves the first passkey
 * with the setup code. After sign-in, it opens the page that the visitor asked
 * for.
 */
export function SignInPage() {
  const { logic, state } = useAuth();
  const location = useLocation();
  const brand = (
    <span className="brand-mark auth-brand" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );

  // The consent page of an app sends the owner here with `returnTo` in the
  // address. The session gate sends it in the state of the navigation.
  const returnTo = safeReturnTo(
    new URLSearchParams(location.search).get("returnTo") ??
      location.state?.returnTo,
  );
  // The text is fixed, so a link cannot put its own words on this page.
  const notice = returnTo.startsWith("/oauth/authorize") ? (
    <p className="auth-notice">
      An app wants to connect to your {APP_NAME}. Sign in first, then {APP_NAME}{" "}
      asks you to allow it.
    </p>
  ) : null;

  if (state.isSignedIn) {
    return isServerPage(returnTo) ? (
      <LoadServerPage path={returnTo} />
    ) : (
      <Navigate to={returnTo} replace />
    );
  }
  if (!logic.canUsePasskeys) {
    return (
      <section className="login-panel auth-panel">
        {brand}
        <h1>This browser cannot use passkeys</h1>
        <p>
          Open {APP_NAME} in a current version of Safari, Chrome, Edge or
          Firefox.
        </p>
      </section>
    );
  }
  if (state.loadSessionState === "error") {
    return (
      <section className="login-panel auth-panel">
        {brand}
        <h1>Sign-in is unavailable</h1>
        <p className="auth-error" role="alert">
          {state.loadSessionError}
        </p>
        <div className="auth-actions">
          <button type="button" onClick={() => void logic.refresh()}>
            Try again
          </button>
        </div>
      </section>
    );
  }
  if (
    state.loadSessionState === "pristine" ||
    state.loadSessionState === "running"
  ) {
    return (
      <section className="login-panel auth-panel" aria-live="polite">
        {brand}
        <h1>Sign in to {APP_NAME}</h1>
        <p className="auth-status">Checking sign-in…</p>
      </section>
    );
  }

  if (state.view === "sign-in") {
    const signingIn = state.signInState === "running";
    return (
      <section className="login-panel auth-panel" aria-live="polite">
        {brand}
        <h1>Sign in to {APP_NAME}</h1>
        {notice}
        <p>
          Use your passkey. Your device asks for your face, fingerprint or
          screen lock.
        </p>
        <div className="auth-actions">
          <button
            type="button"
            disabled={signingIn}
            aria-busy={signingIn}
            onClick={() => void logic.signIn()}
          >
            {signingIn ? WAITING : "Sign in with passkey"}
          </button>
        </div>
        {state.signInError && (
          <p className="auth-error" role="alert">
            {state.signInError}
          </p>
        )}
        <button
          type="button"
          className="auth-link"
          disabled={signingIn}
          onClick={() => logic.showRecovery()}
        >
          Lost your passkey? Use your setup code
        </button>
      </section>
    );
  }

  const creating = state.createPasskeyState === "running";
  const setupCodeProblem =
    state.setupCodeState === "missing"
      ? serverMessage("SETUP_CODE_MISSING")
      : state.setupCodeState === "too_short"
        ? serverMessage("SETUP_CODE_TOO_SHORT")
        : null;
  return (
    <section className="login-panel auth-panel" aria-live="polite">
      {brand}
      <h1>{state.recovery ? "Add a passkey" : `Set up ${APP_NAME}`}</h1>
      {notice}
      <p>
        {state.recovery
          ? "Type your setup code. Then this device saves a new passkey."
          : `Type the setup code that you chose for this ${APP_NAME}. Then this device saves a passkey, and you sign in with your face, fingerprint or screen lock.`}
      </p>
      {setupCodeProblem ? (
        <p className="auth-error" role="alert">
          {setupCodeProblem}
        </p>
      ) : (
        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault();
            void logic.createPasskey();
          }}
        >
          <label>
            Setup code
            <input
              name="setup-code"
              type="password"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              value={state.setupCode}
              disabled={creating}
              onChange={(event) => logic.setSetupCode(event.target.value)}
            />
          </label>
          <button type="submit" disabled={creating} aria-busy={creating}>
            {creating ? WAITING : "Create passkey"}
          </button>
        </form>
      )}
      {state.createPasskeyError && (
        <p className="auth-error" role="alert">
          {state.createPasskeyError}
        </p>
      )}
      {state.recovery && (
        <button
          type="button"
          className="auth-link"
          disabled={creating}
          onClick={() => logic.showSignIn()}
        >
          Back to sign-in
        </button>
      )}
    </section>
  );
}
