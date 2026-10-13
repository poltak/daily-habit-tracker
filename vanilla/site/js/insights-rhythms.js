import { activityNameById, buildBestWeeksAnalysis, groupActivities, summarizeRhythms } from "../lib/insights-rhythms.js";
import { create, html, place, set } from "./dom.js";
import { memo, sameProps } from "./ui.js";

/** @import { Activity, ActivityGroup, Mood } from "../lib/daylio.js" */
/** @import { InsightsDay } from "../lib/insights.js" */
/** @import { BestWeeksAnalysis, QualifyingWeek, RhythmAnalysis, RhythmBucket } from "../lib/insights-rhythms.js" */
/** @typedef {{ days: InsightsDay[]; moods: Mood[]; activities: Activity[]; groups: ActivityGroup[]; startDate: string; endDate: string; asOf: string; weekEndsOn: number }} RhythmInsightsProps */

const DEFAULT_MOOD_MIN = 1;
const DEFAULT_MOOD_MAX = 5;

/** @param {number | null} value */
function formatMean(value) {
  return value === null ? "No mood data" : value.toFixed(2);
}

/** @param {number | null} value */
function formatPercent(value) {
  return value === null ? "—" : `${(value * 100).toFixed(0)}%`;
}

/** @param {number | null} value */
function formatSpread(value) {
  return value === null ? "—" : `${value.toFixed(1)} activities / logged day`;
}

/** @param {string} value */
function formatRangeDate(value) {
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return value;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])));
}

/** @param {readonly Mood[]} moods */
function moodBounds(moods) {
  const scores = moods.map((mood) => mood.score).filter((score) => Number.isFinite(score));
  if (scores.length === 0) return { min: DEFAULT_MOOD_MIN, max: DEFAULT_MOOD_MAX };
  const min = Math.min(DEFAULT_MOOD_MIN, ...scores);
  const max = Math.max(DEFAULT_MOOD_MAX, ...scores);
  return { min, max: min === max ? max + 1 : max };
}

/** @param {number | null} value @param {number} min @param {number} max */
function moodRatio(value, min, max) {
  if (value === null) return null;
  return Math.max(0, Math.min(1, (value - min) / Math.max(1e-9, max - min)));
}

/** @param {readonly RhythmBucket[]} buckets @param {number} left @param {number} step @param {number} baseY @param {number} height */
function activityPath(buckets, left, step, baseY, height) {
  let path = "";
  let open = false;
  buckets.forEach((bucket, index) => {
    const fraction = bucket.activityFrequency?.fraction ?? null;
    if (fraction === null) {
      open = false;
      return;
    }
    const x = left + step * (index + 0.5);
    const y = baseY - Math.max(0, Math.min(1, fraction)) * height;
    path += `${open ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)} `;
    open = true;
  });
  return path.trim();
}

/** The content of one chart figure. @param {{ title: string; buckets: RhythmBucket[]; moods: readonly Mood[]; selectedActivityName: string | null }} input */
function rhythmChart({ title, buckets, moods, selectedActivityName }) {
  const bounds = moodBounds(moods);
  const width = Math.max(600, buckets.length * 92);
  const height = 210;
  const left = 46;
  const right = selectedActivityName ? 56 : 22;
  const top = 24;
  const bottom = 48;
  const plotHeight = height - top - bottom;
  const plotWidth = width - left - right;
  const step = plotWidth / buckets.length;
  const baseline = top + plotHeight;
  const path = selectedActivityName ? activityPath(buckets, left, step, baseline, plotHeight) : "";
  const titleId = `${title.replaceAll(" ", "-")}-title`;

  return html`
    <figcaption class="insight-rhythm-chart-heading">
      <div>
        <h3>${title}</h3>
        <p>Bars show mean mood. Each bucket includes its mood sample size.</p>
      </div>
      <span class="insight-rhythm-chart-range">${bounds.min}–${bounds.max} mood scale</span>
    </figcaption>
    <div class="insights-chart-scroll insight-rhythm-chart-scroll">
      <svg class="insight-rhythm-chart" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${titleId}">
        <title id="${titleId}">${title}</title>
        <desc>${selectedActivityName ? `Mean mood with ${selectedActivityName} recorded as a fraction of logged days. Missing mood observations are left blank.` : "Mean mood by bucket. Missing mood observations are left blank."}</desc>
        <line class="insight-rhythm-axis" x1="${left}" x2="${left}" y1="${top}" y2="${baseline}"></line>
        <line class="insight-rhythm-axis" x1="${left}" x2="${width - right}" y1="${baseline}" y2="${baseline}"></line>
        <text class="insight-rhythm-axis-label" x="${left - 8}" y="${top + 4}" text-anchor="end">${bounds.max}</text>
        <text class="insight-rhythm-axis-label" x="${left - 8}" y="${baseline + 4}" text-anchor="end">${bounds.min}</text>
        ${selectedActivityName ? html`
          <line class="insight-rhythm-axis insight-rhythm-axis-activity" x1="${width - right}" x2="${width - right}" y1="${top}" y2="${baseline}"></line>
          <text class="insight-rhythm-axis-label insight-rhythm-axis-label-activity" x="${width - right + 8}" y="${top + 4}">100%</text>
          <text class="insight-rhythm-axis-label insight-rhythm-axis-label-activity" x="${width - right + 8}" y="${baseline + 4}">0%</text>` : ""}
        ${buckets.map((bucket, index) => {
          const ratio = moodRatio(bucket.mean, bounds.min, bounds.max);
          const x = left + step * index + step * 0.2;
          const barWidth = step * 0.6;
          const barHeight = ratio === null ? 0 : Math.max(2, ratio * plotHeight);
          const barY = baseline - barHeight;
          return html`
            <g>
              <rect class="${ratio === null ? "insight-rhythm-bar insight-rhythm-bar-empty" : "insight-rhythm-bar"}" x="${x}" y="${ratio === null ? baseline - 2 : barY}" width="${barWidth}" height="${ratio === null ? 2 : barHeight}" rx="5">
                <title>${bucket.label}: ${formatMean(bucket.mean)}; ${bucket.count} mood observations; ${bucket.loggedCount} logged days</title>
              </rect>
              <text class="insight-rhythm-sample" x="${x + barWidth / 2}" y="${Math.max(top + 12, barY - 7)}" text-anchor="middle">n=${bucket.count}</text>
              <text class="insight-rhythm-label" x="${x + barWidth / 2}" y="${baseline + 19}" text-anchor="middle">${bucket.label.slice(0, 3)}</text>
              <text class="insight-rhythm-logged" x="${x + barWidth / 2}" y="${baseline + 34}" text-anchor="middle">${bucket.loggedCount}d</text>
            </g>`;
        })}
        ${path ? html`<path class="insight-rhythm-activity-line" d="${path}" fill="none"></path>` : ""}
        ${selectedActivityName ? buckets.map((bucket, index) => {
          const fraction = bucket.activityFrequency?.fraction ?? null;
          if (fraction === null) return "";
          const x = left + step * (index + 0.5);
          const y = baseline - Math.max(0, Math.min(1, fraction)) * plotHeight;
          return html`<circle class="insight-rhythm-activity-dot" cx="${x}" cy="${y}" r="4"><title>${bucket.label}: ${formatPercent(fraction)} of logged days included ${selectedActivityName}</title></circle>`;
        }) : ""}
      </svg>
    </div>
    <div class="insights-legend insight-rhythm-chart-legend" aria-label="${title} legend">
      <span><i class="insight-rhythm-legend-bar" aria-hidden="true"></i> Mean mood</span>
      ${selectedActivityName ? html`<span><i class="insight-rhythm-legend-line" aria-hidden="true"></i> ${selectedActivityName}: recorded fraction</span>` : ""}
      <span><i class="insight-rhythm-legend-sample" aria-hidden="true"></i> n = mood observations · d = logged days</span>
    </div>
    <div class="sr-only">
      <table>
        <caption>${title}</caption>
        <thead><tr><th scope="col">Bucket</th><th scope="col">Mood observations</th><th scope="col">Logged days</th><th scope="col">Mean mood</th>${selectedActivityName ? html`<th scope="col">Activity recorded fraction</th>` : ""}</tr></thead>
        <tbody>${buckets.map((bucket) => html`<tr><th scope="row">${bucket.label}</th><td>${bucket.count}</td><td>${bucket.loggedCount}</td><td>${formatMean(bucket.mean)}</td>${selectedActivityName ? html`<td>${formatPercent(bucket.activityFrequency?.fraction ?? null)}</td>` : ""}</tr>`)}</tbody>
      </table>
    </div>`;
}

/** @param {readonly RhythmBucket[]} buckets */
function strongestBucket(buckets) {
  return [...buckets].filter((bucket) => bucket.mean !== null).sort((a, b) => (b.mean ?? -Infinity) - (a.mean ?? -Infinity) || a.key.localeCompare(b.key))[0] ?? null;
}

/** The content of the year comparison block. @param {RhythmAnalysis} analysis */
function yearComparison(analysis) {
  return html`
    <div class="insight-rhythm-subheading">
      <div>
        <h3 id="insight-rhythm-years-heading">Year comparison</h3>
        <p>Each year keeps its own weekday and month sample sizes.</p>
      </div>
      <span class="insight-rhythm-subheading-note">${analysis.years.length} year${analysis.years.length === 1 ? "" : "s"}</span>
    </div>
    <div class="insight-rhythm-year-grid">
      ${analysis.years.map((year) => {
        const bestWeekday = strongestBucket(year.weekdays);
        const bestMonth = strongestBucket(year.months);
        return html`
          <article class="insight-rhythm-year-card">
            <div class="insight-rhythm-year-card-heading"><strong>${year.year}</strong><span>${year.moodCount} mood obs. · ${year.loggedCount} logged days</span></div>
            <dl>
              <div><dt>Mean mood</dt><dd>${formatMean(year.mean)}</dd></div>
              <div><dt>Strongest weekday</dt><dd>${bestWeekday ? `${bestWeekday.label} · ${formatMean(bestWeekday.mean)} (n=${bestWeekday.count})` : "No mood data"}</dd></div>
              <div><dt>Strongest month</dt><dd>${bestMonth ? `${bestMonth.label} · ${formatMean(bestMonth.mean)} (n=${bestMonth.count})` : "No mood data"}</dd></div>
            </dl>
          </article>`;
      })}
    </div>`;
}

/** @param {{ label: string; value: string; detail: string }} input */
function cohortMetric({ label, value, detail }) {
  return html`<article class="insight-rhythm-metric"><span>${label}</span><strong>${value}</strong><small>${detail}</small></article>`;
}

/** @param {{ week: QualifyingWeek; weekRange: string; names: Map<string, string> }} input */
function weekRow({ week, weekRange, names }) {
  const topActivities = Object.entries(week.activityDays).sort((a, b) => b[1] - a[1] || (names.get(a[0]) ?? a[0]).localeCompare(names.get(b[0]) ?? b[0])).slice(0, 3);
  return html`
    <tr>
      <th scope="row"><span>${formatRangeDate(week.weekStart)} – ${formatRangeDate(week.weekEnd)}</span><small>${weekRange}</small></th>
      <td>${week.moodMean === null ? "No mood" : `${formatMean(week.moodMean)} (n=${week.moodCount})`}</td>
      <td>${week.loggedDays}</td>
      <td>${week.cohort === "higher" ? "Higher mood" : week.cohort === "typical" ? "Typical / rest" : "No mood cohort"}</td>
      <td>${topActivities.length === 0 ? "—" : topActivities.map(([id, count]) => `${names.get(id) ?? id} (${count})`).join(", ")}</td>
    </tr>`;
}

/** The content of the best weeks section. @param {{ analysis: BestWeeksAnalysis; activities: readonly Activity[]; groups: readonly ActivityGroup[] }} input */
function bestWeeks({ analysis, activities, groups }) {
  const names = activityNameById(activities);
  const groupedActivities = groupActivities(activities, groups);
  const comparisons = [...analysis.activityComparisons].sort((a, b) => {
    const aMagnitude = a.difference === null ? -1 : Math.abs(a.difference);
    const bMagnitude = b.difference === null ? -1 : Math.abs(b.difference);
    return bMagnitude - aMagnitude || (names.get(a.activityId) ?? a.activityId).localeCompare(names.get(b.activityId) ?? b.activityId);
  });
  return html`
    <div class="insights-card-heading">
      <div><p class="insights-kicker">Week patterns</p><h2 id="insights-best-weeks-heading">What higher-mood weeks have in common</h2></div>
      <span class="insight-rhythm-section-icon" aria-hidden="true">↗</span>
    </div>
    <p class="insights-help">Weeks are ${analysis.weekRange}, include at least ${analysis.minimumLoggedDays} logged days, fit fully inside the selected range, and ended before the as-of date. Higher mood means the upper mood band among qualifying mood-logged weeks; ties stay together. The comparisons describe association in your records and do not measure duration or causation.</p>
    ${analysis.qualifyingWeekCount === 0 ? html`<div class="insights-empty">There are no ended full weeks with enough logged days in this range yet.</div>` : html`
      <div class="insight-rhythm-cohort-metrics">
        ${cohortMetric({ label: "Higher-mood weeks", value: String(analysis.higher.weekCount), detail: analysis.higher.weekCount === 0 ? "No distinct higher cohort" : `Mean mood ${formatMean(analysis.higher.moodMean)}` })}
        ${cohortMetric({ label: "Typical / rest weeks", value: String(analysis.typical.weekCount), detail: `Mean mood ${formatMean(analysis.typical.moodMean)}` })}
        ${cohortMetric({ label: "Activity spread", value: formatSpread(analysis.higher.activitySpreadMean), detail: `Higher cohort · typical ${formatSpread(analysis.typical.activitySpreadMean)}` })}
      </div>
      ${analysis.higher.weekCount === 0 ? html`<p class="insight-rhythm-note">All mood-logged qualifying weeks have the same mood band, or there is only one. There is no arbitrary best-week label to compare.</p>` : ""}
      <div class="insight-rhythm-comparison">
        <div class="insight-rhythm-subheading"><div><h3>Activity frequency by cohort</h3><p>Each percentage is the average share of logged days per week that included the activity.</p></div><span class="insight-rhythm-subheading-note">${analysis.moodLoggedWeekCount} mood-logged weeks</span></div>
        ${comparisons.length === 0 ? html`<div class="insights-empty">No catalogued activities were recorded in these weeks.</div>` : html`
          <div class="insight-rhythm-table-scroll">
            <table class="insight-rhythm-table">
              <caption class="sr-only">Activity frequency comparison between higher-mood and typical or rest weeks</caption>
              <thead><tr><th scope="col">Activity</th><th scope="col">Higher (${analysis.higher.weekCount})</th><th scope="col">Typical / rest (${analysis.typical.weekCount})</th><th scope="col">Difference</th></tr></thead>
              <tbody>${groupedActivities.map((group) => {
                const groupRows = comparisons.filter((comparison) => group.activities.some((activity) => activity.id === comparison.activityId));
                return groupRows.length === 0 ? "" : html`
                  <tr class="insight-rhythm-group-row"><th colspan="4">${group.group?.name ?? "Other activities"}</th></tr>
                  ${groupRows.map((comparison) => html`<tr><th scope="row">${names.get(comparison.activityId) ?? comparison.activityId}</th><td>${formatPercent(comparison.higherFrequency)}</td><td>${formatPercent(comparison.typicalFrequency)}</td><td class="${comparison.difference === null ? "" : comparison.difference >= 0 ? "insight-rhythm-positive" : "insight-rhythm-negative"}">${comparison.difference === null ? "—" : `${comparison.difference >= 0 ? "+" : ""}${(comparison.difference * 100).toFixed(0)} pp`}</td></tr>`)}`;
              })}</tbody>
            </table>
          </div>`}
      </div>
      <div class="insight-rhythm-week-list">
        <div class="insight-rhythm-subheading"><div><h3>Qualifying weeks</h3><p>Sample sizes stay visible so sparse weeks are easy to discount.</p></div><span class="insight-rhythm-subheading-note">${analysis.qualifyingWeekCount} weeks</span></div>
        <div class="insight-rhythm-table-scroll"><table class="insight-rhythm-table insight-rhythm-week-table"><caption class="sr-only">Qualifying ${analysis.weekRange} weeks</caption><thead><tr><th scope="col">Week</th><th scope="col">Mean mood</th><th scope="col">Logged days</th><th scope="col">Cohort</th><th scope="col">Common activities</th></tr></thead><tbody>${analysis.weeks.map((week) => weekRow({ week, weekRange: analysis.weekRange, names }))}</tbody></table></div>
      </div>`}`;
}

/**
 * Mood by weekday and month, the years side by side, and what the higher-mood weeks have in common.
 * @param {{ invalidate: () => void }} input
 */
export function createRhythmInsights({ invalidate }) {
  let selectedYear = "";
  let selectedActivityId = "";
  // The block renders only when its props or its own selections change. A render of the page for another reason skips it.
  /** @type {RhythmInsightsProps | null} */
  let renderedProps = null;
  let selectionChanged = false;
  const changed = () => {
    selectionChanged = true;
    invalidate();
  };
  const availableMemo = memo();
  const analysisMemo = memo();
  const bestWeeksMemo = memo();

  const node = create(html`
    <div class="insight-rhythm-stack">
      <section id="insights-rhythms" class="insights-card insight-rhythm-section" aria-labelledby="insights-rhythms-heading">
        <div class="insights-card-heading">
          <div><p class="insights-kicker">Rhythm patterns</p><h2 id="insights-rhythms-heading">Weekly and seasonal rhythms</h2></div>
          <span class="insight-rhythm-section-icon" aria-hidden="true">◒</span>
        </div>
        <p class="insights-help">See how mood varies by weekday and month. Every bucket shows mood observations and logged days; a missing mood remains blank. Filter the mood view by year and optionally overlay an activity’s recorded fraction.</p>
        <div class="insight-rhythm-controls">
          <label class="insights-field"><span>Year filter</span><select class="insights-select" data-action="rhythm-year"></select></label>
          <label class="insights-field"><span>Activity overlay</span><select class="insights-select" data-action="rhythm-activity"></select></label>
        </div>
      </section>
      <section id="insights-best-weeks" class="insights-card insight-rhythm-section" aria-labelledby="insights-best-weeks-heading"></section>
    </div>`);
  const [rhythmSection, bestWeeksSection] = /** @type {HTMLElement[]} */ ([...node.children]);
  const [yearSelect, activitySelect] = /** @type {HTMLSelectElement[]} */ ([...rhythmSection.querySelectorAll("select")]);
  const empty = create(html`<div class="insights-empty">No logged days fall inside this range yet.</div>`);
  const weekdayChart = create(html`<figure class="insight-rhythm-chart-card"></figure>`);
  const monthChart = create(html`<figure class="insight-rhythm-chart-card"></figure>`);
  const years = create(html`<div class="insight-rhythm-years" aria-labelledby="insight-rhythm-years-heading"></div>`);

  /** @param {RhythmInsightsProps} props */
  function update(props) {
    if (!selectionChanged && sameProps(renderedProps, props)) return;
    renderedProps = props;
    selectionChanged = false;
    const { days, moods, activities, groups, startDate, endDate, asOf, weekEndsOn } = props;
    /** @type {RhythmAnalysis} */
    const availableRhythms = availableMemo([days, moods, startDate, endDate], () => summarizeRhythms({ days, moods, startDate, endDate, year: null, activityId: null }));
    const effectiveSelectedYear = selectedYear !== "" && availableRhythms.yearOptions.includes(Number(selectedYear)) ? selectedYear : "";
    /** @type {RhythmAnalysis} */
    const rhythmAnalysis = analysisMemo([days, moods, startDate, endDate, effectiveSelectedYear, selectedActivityId], () => summarizeRhythms({ days, moods, startDate, endDate, year: effectiveSelectedYear === "" ? null : Number(effectiveSelectedYear), activityId: selectedActivityId || null }));
    /** @type {BestWeeksAnalysis} */
    const bestWeeksAnalysis = bestWeeksMemo([days, moods, activities, groups, startDate, endDate, asOf, weekEndsOn], () => buildBestWeeksAnalysis({ days, moods, activities, groups, startDate, endDate, asOf, weekEndsOn }));
    const selectedActivityName = selectedActivityId ? activityNameById(activities).get(selectedActivityId) ?? selectedActivityId : null;
    const hasDays = rhythmAnalysis.loggedCount > 0;
    const hasYears = hasDays && rhythmAnalysis.years.length > 0;

    set(yearSelect, { html: html`<option value="">All years</option>${availableRhythms.yearOptions.map((year) => html`<option value="${year}">${year}</option>`)}`, value: effectiveSelectedYear });
    set(activitySelect, {
      html: html`<option value="">No activity overlay</option>${activities.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)).map((activity) => html`<option value="${activity.id}">${activity.name}${activity.archived ? " (archived)" : ""}</option>`)}`,
      value: selectedActivityId,
    });
    place({ node: empty, present: !hasDays, parent: rhythmSection });
    place({ node: years, present: hasYears, parent: rhythmSection });
    place({ node: monthChart, present: hasDays, parent: rhythmSection, before: hasYears ? years : null });
    place({ node: weekdayChart, present: hasDays, parent: rhythmSection, before: monthChart });
    if (hasDays) {
      set(weekdayChart, { html: rhythmChart({ title: "Mood by weekday", buckets: rhythmAnalysis.weekdays, moods, selectedActivityName }) });
      set(monthChart, { html: rhythmChart({ title: "Mood by month", buckets: rhythmAnalysis.months, moods, selectedActivityName }) });
    }
    if (hasYears) set(years, { html: yearComparison(rhythmAnalysis) });
    set(bestWeeksSection, { html: bestWeeks({ analysis: bestWeeksAnalysis, activities, groups }) });
  }

  return {
    node,
    update,
    handlers: {
      change: {
        "rhythm-year": (/** @type {HTMLSelectElement} */ select) => {
          selectedYear = select.value;
          changed();
        },
        "rhythm-activity": (/** @type {HTMLSelectElement} */ select) => {
          selectedActivityId = select.value;
          changed();
        },
      },
    },
  };
}
