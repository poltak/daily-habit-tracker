"use client";

import { useMemo, useState } from "react";
import type { Activity, ActivityGroup, Mood } from "../../lib/daylio.ts";
import type { InsightsDay } from "../../lib/insights.ts";
import {
  activityNameById,
  buildBestWeeksAnalysis,
  groupActivities,
  summarizeRhythms,
  type BestWeeksAnalysis,
  type QualifyingWeek,
  type RhythmAnalysis,
  type RhythmBucket,
} from "../../lib/insights-rhythms.ts";
import "./insights-rhythms.css";

export type RhythmInsightsProps = {
  days: InsightsDay[];
  moods: Mood[];
  activities: Activity[];
  groups: ActivityGroup[];
  startDate: string;
  endDate: string;
  asOf: string;
};

const DEFAULT_MOOD_MIN = 1;
const DEFAULT_MOOD_MAX = 5;

function formatMean(value: number | null) {
  return value === null ? "No mood data" : value.toFixed(2);
}

function formatPercent(value: number | null) {
  return value === null ? "—" : `${(value * 100).toFixed(0)}%`;
}

function formatSpread(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)} activities / logged day`;
}

function formatRangeDate(value: string) {
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return value;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])));
}

function moodBounds(moods: readonly Mood[]) {
  const scores = moods.map((mood) => mood.score).filter((score) => Number.isFinite(score));
  if (scores.length === 0) return { min: DEFAULT_MOOD_MIN, max: DEFAULT_MOOD_MAX };
  const min = Math.min(DEFAULT_MOOD_MIN, ...scores);
  const max = Math.max(DEFAULT_MOOD_MAX, ...scores);
  return { min, max: min === max ? max + 1 : max };
}

function moodRatio(value: number | null, min: number, max: number) {
  if (value === null) return null;
  return Math.max(0, Math.min(1, (value - min) / Math.max(1e-9, max - min)));
}

function activityPath(buckets: readonly RhythmBucket[], left: number, step: number, baseY: number, height: number) {
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

function RhythmChart({ title, buckets, moods, selectedActivityName }: { title: string; buckets: RhythmBucket[]; moods: readonly Mood[]; selectedActivityName: string | null }) {
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

  return (
    <figure className="insight-rhythm-chart-card">
      <figcaption className="insight-rhythm-chart-heading">
        <div>
          <h3>{title}</h3>
          <p>Bars show mean mood. Each bucket includes its mood sample size.</p>
        </div>
        <span className="insight-rhythm-chart-range">{bounds.min}–{bounds.max} mood scale</span>
      </figcaption>
      <div className="insights-chart-scroll insight-rhythm-chart-scroll">
        <svg className="insight-rhythm-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${title.replaceAll(" ", "-")}-title`}>
          <title id={`${title.replaceAll(" ", "-")}-title`}>{title}</title>
          <desc>{selectedActivityName ? `Mean mood with ${selectedActivityName} recorded as a fraction of logged days. Missing mood observations are left blank.` : "Mean mood by bucket. Missing mood observations are left blank."}</desc>
          <line className="insight-rhythm-axis" x1={left} x2={left} y1={top} y2={baseline} />
          <line className="insight-rhythm-axis" x1={left} x2={width - right} y1={baseline} y2={baseline} />
          <text className="insight-rhythm-axis-label" x={left - 8} y={top + 4} textAnchor="end">{bounds.max}</text>
          <text className="insight-rhythm-axis-label" x={left - 8} y={baseline + 4} textAnchor="end">{bounds.min}</text>
          {selectedActivityName ? <>
            <line className="insight-rhythm-axis insight-rhythm-axis-activity" x1={width - right} x2={width - right} y1={top} y2={baseline} />
            <text className="insight-rhythm-axis-label insight-rhythm-axis-label-activity" x={width - right + 8} y={top + 4}>{"100%"}</text>
            <text className="insight-rhythm-axis-label insight-rhythm-axis-label-activity" x={width - right + 8} y={baseline + 4}>0%</text>
          </> : null}
          {buckets.map((bucket, index) => {
            const ratio = moodRatio(bucket.mean, bounds.min, bounds.max);
            const x = left + step * index + step * 0.2;
            const barWidth = step * 0.6;
            const barHeight = ratio === null ? 0 : Math.max(2, ratio * plotHeight);
            const barY = baseline - barHeight;
            return <g key={bucket.key}>
              <rect className={ratio === null ? "insight-rhythm-bar insight-rhythm-bar-empty" : "insight-rhythm-bar"} x={x} y={ratio === null ? baseline - 2 : barY} width={barWidth} height={ratio === null ? 2 : barHeight} rx="5">
                <title>{`${bucket.label}: ${formatMean(bucket.mean)}; ${bucket.count} mood observations; ${bucket.loggedCount} logged days`}</title>
              </rect>
              <text className="insight-rhythm-sample" x={x + barWidth / 2} y={Math.max(top + 12, barY - 7)} textAnchor="middle">{`n=${bucket.count}`}</text>
              <text className="insight-rhythm-label" x={x + barWidth / 2} y={baseline + 19} textAnchor="middle">{bucket.label.slice(0, 3)}</text>
              <text className="insight-rhythm-logged" x={x + barWidth / 2} y={baseline + 34} textAnchor="middle">{`${bucket.loggedCount}d`}</text>
            </g>;
          })}
          {path ? <path className="insight-rhythm-activity-line" d={path} fill="none" /> : null}
          {selectedActivityName ? buckets.map((bucket, index) => {
            const fraction = bucket.activityFrequency?.fraction ?? null;
            if (fraction === null) return null;
            const x = left + step * (index + 0.5);
            const y = baseline - Math.max(0, Math.min(1, fraction)) * plotHeight;
            return <circle className="insight-rhythm-activity-dot" key={`${bucket.key}-activity`} cx={x} cy={y} r="4">
              <title>{`${bucket.label}: ${formatPercent(fraction)} of logged days included ${selectedActivityName}`}</title>
            </circle>;
          }) : null}
        </svg>
      </div>
      <div className="insights-legend insight-rhythm-chart-legend" aria-label={`${title} legend`}>
        <span><i className="insight-rhythm-legend-bar" aria-hidden="true" /> Mean mood</span>
        {selectedActivityName ? <span><i className="insight-rhythm-legend-line" aria-hidden="true" /> {selectedActivityName}: recorded fraction</span> : null}
        <span><i className="insight-rhythm-legend-sample" aria-hidden="true" /> n = mood observations · d = logged days</span>
      </div>
      <div className="sr-only">
        <table>
          <caption>{title}</caption>
          <thead><tr><th scope="col">Bucket</th><th scope="col">Mood observations</th><th scope="col">Logged days</th><th scope="col">Mean mood</th>{selectedActivityName ? <th scope="col">Activity recorded fraction</th> : null}</tr></thead>
          <tbody>{buckets.map((bucket) => <tr key={`${title}-${bucket.key}`}><th scope="row">{bucket.label}</th><td>{bucket.count}</td><td>{bucket.loggedCount}</td><td>{formatMean(bucket.mean)}</td>{selectedActivityName ? <td>{formatPercent(bucket.activityFrequency?.fraction ?? null)}</td> : null}</tr>)}</tbody>
        </table>
      </div>
    </figure>
  );
}

function strongestBucket(buckets: readonly RhythmBucket[]) {
  return [...buckets].filter((bucket) => bucket.mean !== null).sort((a, b) => (b.mean ?? -Infinity) - (a.mean ?? -Infinity) || a.key.localeCompare(b.key))[0] ?? null;
}

function YearComparison({ analysis }: { analysis: RhythmAnalysis }) {
  if (analysis.years.length === 0) return null;
  return <div className="insight-rhythm-years" aria-labelledby="insight-rhythm-years-heading">
    <div className="insight-rhythm-subheading">
      <div>
        <h3 id="insight-rhythm-years-heading">Year comparison</h3>
        <p>Each year keeps its own weekday and month sample sizes.</p>
      </div>
      <span className="insight-rhythm-subheading-note">{analysis.years.length} year{analysis.years.length === 1 ? "" : "s"}</span>
    </div>
    <div className="insight-rhythm-year-grid">
      {analysis.years.map((year) => {
        const bestWeekday = strongestBucket(year.weekdays);
        const bestMonth = strongestBucket(year.months);
        return <article className="insight-rhythm-year-card" key={year.year}>
          <div className="insight-rhythm-year-card-heading"><strong>{year.year}</strong><span>{`${year.moodCount} mood obs. · ${year.loggedCount} logged days`}</span></div>
          <dl>
            <div><dt>Mean mood</dt><dd>{formatMean(year.mean)}</dd></div>
            <div><dt>Strongest weekday</dt><dd>{bestWeekday ? `${bestWeekday.label} · ${formatMean(bestWeekday.mean)} (n=${bestWeekday.count})` : "No mood data"}</dd></div>
            <div><dt>Strongest month</dt><dd>{bestMonth ? `${bestMonth.label} · ${formatMean(bestMonth.mean)} (n=${bestMonth.count})` : "No mood data"}</dd></div>
          </dl>
        </article>;
      })}
    </div>
  </div>;
}

function CohortMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="insight-rhythm-metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function WeekRow({ week, names }: { week: QualifyingWeek; names: Map<string, string> }) {
  const topActivities = Object.entries(week.activityDays).sort((a, b) => b[1] - a[1] || (names.get(a[0]) ?? a[0]).localeCompare(names.get(b[0]) ?? b[0])).slice(0, 3);
  return <tr>
    <th scope="row"><span>{`${formatRangeDate(week.weekStart)} – ${formatRangeDate(week.weekEnd)}`}</span><small>Monday–Sunday</small></th>
    <td>{week.moodMean === null ? "No mood" : `${formatMean(week.moodMean)} (n=${week.moodCount})`}</td>
    <td>{week.loggedDays}</td>
    <td>{week.cohort === "higher" ? "Higher mood" : week.cohort === "typical" ? "Typical / rest" : "No mood cohort"}</td>
    <td>{topActivities.length === 0 ? "—" : topActivities.map(([id, count]) => `${names.get(id) ?? id} (${count})`).join(", ")}</td>
  </tr>;
}

function BestWeeksSection({ analysis, activities, groups }: { analysis: BestWeeksAnalysis; activities: readonly Activity[]; groups: readonly ActivityGroup[] }) {
  const names = useMemo(() => activityNameById(activities), [activities]);
  const groupedActivities = useMemo(() => groupActivities(activities, groups), [activities, groups]);
  const comparisons = useMemo(() => [...analysis.activityComparisons].sort((a, b) => {
    const aMagnitude = a.difference === null ? -1 : Math.abs(a.difference);
    const bMagnitude = b.difference === null ? -1 : Math.abs(b.difference);
    return bMagnitude - aMagnitude || (names.get(a.activityId) ?? a.activityId).localeCompare(names.get(b.activityId) ?? b.activityId);
  }), [analysis.activityComparisons, names]);
  return <section id="insights-best-weeks" className="insights-card insight-rhythm-section" aria-labelledby="insights-best-weeks-heading">
    <div className="insights-card-heading">
      <div><p className="insights-kicker">Week patterns</p><h2 id="insights-best-weeks-heading">What higher-mood weeks have in common</h2></div>
      <span className="insight-rhythm-section-icon" aria-hidden="true">↗</span>
    </div>
    <p className="insights-help">Weeks are Monday–Sunday, include at least {analysis.minimumLoggedDays} logged days, fit fully inside the selected range, and ended before the as-of date. Higher mood means the upper mood band among qualifying mood-logged weeks; ties stay together. The comparisons describe association in your records and do not measure duration or causation.</p>
    {analysis.qualifyingWeekCount === 0 ? <div className="insights-empty">There are no ended full weeks with enough logged days in this range yet.</div> : <>
      <div className="insight-rhythm-cohort-metrics">
        <CohortMetric label="Higher-mood weeks" value={String(analysis.higher.weekCount)} detail={analysis.higher.weekCount === 0 ? "No distinct higher cohort" : `Mean mood ${formatMean(analysis.higher.moodMean)}`} />
        <CohortMetric label="Typical / rest weeks" value={String(analysis.typical.weekCount)} detail={`Mean mood ${formatMean(analysis.typical.moodMean)}`} />
        <CohortMetric label="Activity spread" value={formatSpread(analysis.higher.activitySpreadMean)} detail={`Higher cohort · typical ${formatSpread(analysis.typical.activitySpreadMean)}`} />
      </div>
      {analysis.higher.weekCount === 0 ? <p className="insight-rhythm-note">All mood-logged qualifying weeks have the same mood band, or there is only one. There is no arbitrary best-week label to compare.</p> : null}
      <div className="insight-rhythm-comparison">
        <div className="insight-rhythm-subheading"><div><h3>Activity frequency by cohort</h3><p>Each percentage is the average share of logged days per week that included the activity.</p></div><span className="insight-rhythm-subheading-note">{analysis.moodLoggedWeekCount} mood-logged weeks</span></div>
        {comparisons.length === 0 ? <div className="insights-empty">No catalogued activities were recorded in these weeks.</div> : <div className="insight-rhythm-table-scroll">
          <table className="insight-rhythm-table">
            <caption className="sr-only">Activity frequency comparison between higher-mood and typical or rest weeks</caption>
            <thead><tr><th scope="col">Activity</th><th scope="col">Higher ({analysis.higher.weekCount})</th><th scope="col">Typical / rest ({analysis.typical.weekCount})</th><th scope="col">Difference</th></tr></thead>
            <tbody>{groupedActivities.flatMap((group) => {
              const groupRows = comparisons.filter((comparison) => group.activities.some((activity) => activity.id === comparison.activityId));
              return groupRows.length === 0 ? [] : [
                <tr className="insight-rhythm-group-row" key={`group-${group.group?.id ?? "other"}`}><th colSpan={4}>{group.group?.name ?? "Other activities"}</th></tr>,
                ...groupRows.map((comparison) => <tr key={comparison.activityId}><th scope="row">{names.get(comparison.activityId) ?? comparison.activityId}</th><td>{formatPercent(comparison.higherFrequency)}</td><td>{formatPercent(comparison.typicalFrequency)}</td><td className={comparison.difference === null ? "" : comparison.difference >= 0 ? "insight-rhythm-positive" : "insight-rhythm-negative"}>{comparison.difference === null ? "—" : `${comparison.difference >= 0 ? "+" : ""}${(comparison.difference * 100).toFixed(0)} pp`}</td></tr>),
              ];
            })}</tbody>
          </table>
        </div>}
      </div>
      <div className="insight-rhythm-week-list">
        <div className="insight-rhythm-subheading"><div><h3>Qualifying weeks</h3><p>Sample sizes stay visible so sparse weeks are easy to discount.</p></div><span className="insight-rhythm-subheading-note">{analysis.qualifyingWeekCount} weeks</span></div>
        <div className="insight-rhythm-table-scroll"><table className="insight-rhythm-table insight-rhythm-week-table"><caption className="sr-only">Qualifying Monday to Sunday weeks</caption><thead><tr><th scope="col">Week</th><th scope="col">Mean mood</th><th scope="col">Logged days</th><th scope="col">Cohort</th><th scope="col">Common activities</th></tr></thead><tbody>{analysis.weeks.map((week) => <WeekRow key={week.weekStart} week={week} names={names} />)}</tbody></table></div>
      </div>
    </>}
  </section>;
}

export function RhythmInsights({ days, moods, activities, groups, startDate, endDate, asOf }: RhythmInsightsProps) {
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedActivityId, setSelectedActivityId] = useState("");
  const availableRhythms = useMemo(() => summarizeRhythms({ days, moods, startDate, endDate, year: null, activityId: null }), [days, moods, startDate, endDate]);
  const effectiveSelectedYear = selectedYear !== "" && availableRhythms.yearOptions.includes(Number(selectedYear)) ? selectedYear : "";
  const rhythmAnalysis = useMemo(() => summarizeRhythms({ days, moods, startDate, endDate, year: effectiveSelectedYear === "" ? null : Number(effectiveSelectedYear), activityId: selectedActivityId || null }), [days, moods, startDate, endDate, effectiveSelectedYear, selectedActivityId]);
  const bestWeeks = useMemo(() => buildBestWeeksAnalysis({ days, moods, activities, groups, startDate, endDate, asOf }), [days, moods, activities, groups, startDate, endDate, asOf]);
  const selectedActivityName = selectedActivityId ? activityNameById(activities).get(selectedActivityId) ?? selectedActivityId : null;
  const hasDays = rhythmAnalysis.loggedCount > 0;

  return <div className="insight-rhythm-stack">
    <section id="insights-rhythms" className="insights-card insight-rhythm-section" aria-labelledby="insights-rhythms-heading">
      <div className="insights-card-heading">
        <div><p className="insights-kicker">Rhythm patterns</p><h2 id="insights-rhythms-heading">Weekly and seasonal rhythms</h2></div>
        <span className="insight-rhythm-section-icon" aria-hidden="true">◒</span>
      </div>
      <p className="insights-help">See how mood varies by weekday and month. Every bucket shows mood observations and logged days; a missing mood remains blank. Filter the mood view by year and optionally overlay an activity’s recorded fraction.</p>
      <div className="insight-rhythm-controls">
        <label className="insights-field"><span>Year filter</span><select className="insights-select" value={effectiveSelectedYear} onChange={(event) => setSelectedYear(event.target.value)}><option value="">All years</option>{availableRhythms.yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
        <label className="insights-field"><span>Activity overlay</span><select className="insights-select" value={selectedActivityId} onChange={(event) => setSelectedActivityId(event.target.value)}><option value="">No activity overlay</option>{activities.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)).map((activity) => <option key={activity.id} value={activity.id}>{activity.name}{activity.archived ? " (archived)" : ""}</option>)}</select></label>
      </div>
      {!hasDays ? <div className="insights-empty">No logged days fall inside this range yet.</div> : <>
        <RhythmChart title="Mood by weekday" buckets={rhythmAnalysis.weekdays} moods={moods} selectedActivityName={selectedActivityName} />
        <RhythmChart title="Mood by month" buckets={rhythmAnalysis.months} moods={moods} selectedActivityName={selectedActivityName} />
        <YearComparison analysis={rhythmAnalysis} />
      </>}
    </section>
    <BestWeeksSection analysis={bestWeeks} activities={activities} groups={groups} />
  </div>;
}
