/**
 * The Insights and Setup pages are not rebuilt yet. These pages stand in with
 * the headings of the old pages, so that the navigation has a place to go.
 */

export function InsightsPlaceholder() {
  return (
    <section className="page-section insights-page">
      <div className="page-intro">
        <p className="eyebrow">Your history</p>
        <h1>Your everyday, over time.</h1>
        <label className="muted">
          Explore a period
          <select aria-label="Explore a period" defaultValue="all">
            <option value="all">All time</option>
          </select>
        </label>
      </div>
    </section>
  );
}

export function SetupPlaceholder({
  signingOut,
  signOutError,
  onSignOut,
}: {
  signingOut: boolean;
  signOutError: string | null;
  onSignOut: () => void;
}) {
  return (
    <section className="page-section settings-page">
      <div className="page-intro">
        <p className="eyebrow">Your setup</p>
        <h1>Make it yours</h1>
      </div>
      {signOutError && <p role="alert">{signOutError}</p>}
      <button
        type="button"
        className="secondary-button"
        disabled={signingOut}
        onClick={onSignOut}
      >
        Sign out
      </button>
    </section>
  );
}
