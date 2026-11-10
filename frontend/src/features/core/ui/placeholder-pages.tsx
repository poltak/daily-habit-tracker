/**
 * The Setup page is not rebuilt yet. This page stands in with the heading of
 * the old page, so that the navigation has a place to go.
 */

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
