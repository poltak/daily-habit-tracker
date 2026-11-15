import type { ErrorFallbackProps } from "./error-boundary.js";

export function PageErrorFallback({ reset }: ErrorFallbackProps) {
  return (
    <section className="page-section">
      <div className="page-intro">
        <p className="eyebrow">Your journal</p>
        <h1>This page failed to load</h1>
      </div>
      <div className="notice error" role="alert">
        <p>An unexpected error occurred on this page.</p>
        <button type="button" className="loading-retry" onClick={reset}>
          Try again
        </button>
      </div>
    </section>
  );
}

export function AppErrorFallback({ reset }: ErrorFallbackProps) {
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <h1>Something went wrong</h1>
        <p className="auth-error" role="alert">
          An unexpected error occurred.
        </p>
        <div className="auth-actions">
          <button type="button" className="primary-button" onClick={reset}>
            Try again
          </button>
        </div>
      </section>
    </main>
  );
}
