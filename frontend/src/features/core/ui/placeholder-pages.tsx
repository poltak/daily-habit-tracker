/**
 * The Insights page is not rebuilt yet. This page stands in with
 * the heading of the old page, so that the navigation has a place to go.
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
