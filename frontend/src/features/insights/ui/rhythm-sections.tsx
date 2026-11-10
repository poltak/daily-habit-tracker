import type {
  Activity,
  ActivityGroup,
  Mood,
} from "@app/common/features/catalog/types";
import {
  activityNameById,
  groupActivities,
} from "@app/common/features/insights/utils/activity-lists";
import type {
  BestWeeksAnalysis,
  QualifyingWeek,
  RhythmAnalysis,
} from "@app/common/features/insights/utils/rhythm-types";
import {
  formatMean,
  formatPercent,
  formatRangeDate,
  formatSpread,
  strongestBucket,
} from "../utils/rhythm-format.js";
import type { RhythmView } from "../utils/rhythm-view.js";
import type { InsightsLogic } from "./insights-logic.js";
import { RhythmChart } from "./rhythm-chart.js";

function YearComparison({ analysis }: { analysis: RhythmAnalysis }) {
  if (analysis.years.length === 0) {
    return null;
  }
  return (
    <div
      className="insight-rhythm-years"
      aria-labelledby="insight-rhythm-years-heading"
    >
      <div className="insight-rhythm-subheading">
        <div>
          <h3 id="insight-rhythm-years-heading">Year comparison</h3>
          <p>Each year keeps its own weekday and month sample sizes.</p>
        </div>
        <span className="insight-rhythm-subheading-note">
          {analysis.years.length} year{analysis.years.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="insight-rhythm-year-grid">
        {analysis.years.map((year) => {
          const bestWeekday = strongestBucket(year.weekdays);
          const bestMonth = strongestBucket(year.months);
          return (
            <article className="insight-rhythm-year-card" key={year.year}>
              <div className="insight-rhythm-year-card-heading">
                <strong>{year.year}</strong>
                <span>{`${year.moodCount} mood obs. · ${year.loggedCount} logged days`}</span>
              </div>
              <dl>
                <div>
                  <dt>Mean mood</dt>
                  <dd>{formatMean(year.mean)}</dd>
                </div>
                <div>
                  <dt>Strongest weekday</dt>
                  <dd>
                    {bestWeekday
                      ? `${bestWeekday.label} · ${formatMean(bestWeekday.mean)} (n=${bestWeekday.count})`
                      : "No mood data"}
                  </dd>
                </div>
                <div>
                  <dt>Strongest month</dt>
                  <dd>
                    {bestMonth
                      ? `${bestMonth.label} · ${formatMean(bestMonth.mean)} (n=${bestMonth.count})`
                      : "No mood data"}
                  </dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function CohortMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="insight-rhythm-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function WeekRow({
  week,
  weekRange,
  names,
}: {
  week: QualifyingWeek;
  weekRange: string;
  names: ReadonlyMap<string, string>;
}) {
  const topActivities = Object.entries(week.activityDays)
    .toSorted(
      (a, b) =>
        b[1] - a[1] ||
        (names.get(a[0]) ?? a[0]).localeCompare(names.get(b[0]) ?? b[0]),
    )
    .slice(0, 3);
  return (
    <tr>
      <th scope="row">
        <span>{`${formatRangeDate(week.weekStart)} – ${formatRangeDate(week.weekEnd)}`}</span>
        <small>{weekRange}</small>
      </th>
      <td>
        {week.moodMean === null
          ? "No mood"
          : `${formatMean(week.moodMean)} (n=${week.moodCount})`}
      </td>
      <td>{week.loggedDays}</td>
      <td>
        {week.cohort === "higher"
          ? "Higher mood"
          : week.cohort === "typical"
            ? "Typical / rest"
            : "No mood cohort"}
      </td>
      <td>
        {topActivities.length === 0
          ? "—"
          : topActivities
              .map(([id, count]) => `${names.get(id) ?? id} (${count})`)
              .join(", ")}
      </td>
    </tr>
  );
}

function differenceClass(difference: number | null): string {
  if (difference === null) {
    return "";
  }
  return difference >= 0
    ? "insight-rhythm-positive"
    : "insight-rhythm-negative";
}

function BestWeeksSection({
  analysis,
  activities,
  groups,
}: {
  analysis: BestWeeksAnalysis;
  activities: readonly Activity[];
  groups: readonly ActivityGroup[];
}) {
  const names = activityNameById(activities);
  const groupedActivities = groupActivities(activities, groups);
  const comparisons = [...analysis.activityComparisons].toSorted((a, b) => {
    const aMagnitude = a.difference === null ? -1 : Math.abs(a.difference);
    const bMagnitude = b.difference === null ? -1 : Math.abs(b.difference);
    return (
      bMagnitude - aMagnitude ||
      (names.get(a.activityId) ?? a.activityId).localeCompare(
        names.get(b.activityId) ?? b.activityId,
      )
    );
  });
  return (
    <section
      id="insights-best-weeks"
      className="insights-card insight-rhythm-section"
      aria-labelledby="insights-best-weeks-heading"
    >
      <div className="insights-card-heading">
        <div>
          <p className="insights-kicker">Week patterns</p>
          <h2 id="insights-best-weeks-heading">
            What higher-mood weeks have in common
          </h2>
        </div>
        <span className="insight-rhythm-section-icon" aria-hidden="true">
          ↗
        </span>
      </div>
      <p className="insights-help">
        Weeks are {analysis.weekRange}, include at least{" "}
        {analysis.minimumLoggedDays} logged days, fit fully inside the selected
        range, and ended before the as-of date. Higher mood means the upper mood
        band among qualifying mood-logged weeks; ties stay together. The
        comparisons describe association in your records and do not measure
        duration or causation.
      </p>
      {analysis.qualifyingWeekCount === 0 ? (
        <div className="insights-empty">
          There are no ended full weeks with enough logged days in this range
          yet.
        </div>
      ) : (
        <>
          <div className="insight-rhythm-cohort-metrics">
            <CohortMetric
              label="Higher-mood weeks"
              value={String(analysis.higher.weekCount)}
              detail={
                analysis.higher.weekCount === 0
                  ? "No distinct higher cohort"
                  : `Mean mood ${formatMean(analysis.higher.moodMean)}`
              }
            />
            <CohortMetric
              label="Typical / rest weeks"
              value={String(analysis.typical.weekCount)}
              detail={`Mean mood ${formatMean(analysis.typical.moodMean)}`}
            />
            <CohortMetric
              label="Activity spread"
              value={formatSpread(analysis.higher.activitySpreadMean)}
              detail={`Higher cohort · typical ${formatSpread(analysis.typical.activitySpreadMean)}`}
            />
          </div>
          {analysis.higher.weekCount === 0 ? (
            <p className="insight-rhythm-note">
              All mood-logged qualifying weeks have the same mood band, or there
              is only one. There is no arbitrary best-week label to compare.
            </p>
          ) : null}
          <div className="insight-rhythm-comparison">
            <div className="insight-rhythm-subheading">
              <div>
                <h3>Activity frequency by cohort</h3>
                <p>
                  Each percentage is the average share of logged days per week
                  that included the activity.
                </p>
              </div>
              <span className="insight-rhythm-subheading-note">
                {analysis.moodLoggedWeekCount} mood-logged weeks
              </span>
            </div>
            {comparisons.length === 0 ? (
              <div className="insights-empty">
                No catalogued activities were recorded in these weeks.
              </div>
            ) : (
              <div className="insight-rhythm-table-scroll">
                <table className="insight-rhythm-table">
                  <caption className="sr-only">
                    Activity frequency comparison between higher-mood and
                    typical or rest weeks
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Activity</th>
                      <th scope="col">Higher ({analysis.higher.weekCount})</th>
                      <th scope="col">
                        Typical / rest ({analysis.typical.weekCount})
                      </th>
                      <th scope="col">Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedActivities.flatMap((group) => {
                      const groupRows = comparisons.filter((comparison) =>
                        group.activities.some(
                          (activity) => activity.id === comparison.activityId,
                        ),
                      );
                      return groupRows.length === 0
                        ? []
                        : [
                            <tr
                              className="insight-rhythm-group-row"
                              key={`group-${group.group?.id ?? "other"}`}
                            >
                              <th colSpan={4}>
                                {group.group?.name ?? "Other activities"}
                              </th>
                            </tr>,
                            ...groupRows.map((comparison) => (
                              <tr key={comparison.activityId}>
                                <th scope="row">
                                  {names.get(comparison.activityId) ??
                                    comparison.activityId}
                                </th>
                                <td>
                                  {formatPercent(comparison.higherFrequency)}
                                </td>
                                <td>
                                  {formatPercent(comparison.typicalFrequency)}
                                </td>
                                <td
                                  className={differenceClass(
                                    comparison.difference,
                                  )}
                                >
                                  {comparison.difference === null
                                    ? "—"
                                    : `${comparison.difference >= 0 ? "+" : ""}${(comparison.difference * 100).toFixed(0)} pp`}
                                </td>
                              </tr>
                            )),
                          ];
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="insight-rhythm-week-list">
            <div className="insight-rhythm-subheading">
              <div>
                <h3>Qualifying weeks</h3>
                <p>
                  Sample sizes stay visible so sparse weeks are easy to
                  discount.
                </p>
              </div>
              <span className="insight-rhythm-subheading-note">
                {analysis.qualifyingWeekCount} weeks
              </span>
            </div>
            <div className="insight-rhythm-table-scroll">
              <table className="insight-rhythm-table insight-rhythm-week-table">
                <caption className="sr-only">
                  Qualifying {analysis.weekRange} weeks
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Week</th>
                    <th scope="col">Mean mood</th>
                    <th scope="col">Logged days</th>
                    <th scope="col">Cohort</th>
                    <th scope="col">Common activities</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.weeks.map((week) => (
                    <WeekRow
                      key={week.weekStart}
                      week={week}
                      weekRange={analysis.weekRange}
                      names={names}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

/** The sections about weekdays, months, years and weeks. */
export function RhythmSections({
  logic,
  view,
  moods,
  activities,
  groups,
}: {
  logic: InsightsLogic;
  view: RhythmView;
  moods: readonly Mood[];
  activities: readonly Activity[];
  groups: readonly ActivityGroup[];
}) {
  return (
    <div className="insight-rhythm-stack">
      <section
        id="insights-rhythms"
        className="insights-card insight-rhythm-section"
        aria-labelledby="insights-rhythms-heading"
      >
        <div className="insights-card-heading">
          <div>
            <p className="insights-kicker">Rhythm patterns</p>
            <h2 id="insights-rhythms-heading">Weekly and seasonal rhythms</h2>
          </div>
          <span className="insight-rhythm-section-icon" aria-hidden="true">
            ◒
          </span>
        </div>
        <p className="insights-help">
          See how mood varies by weekday and month. Every bucket shows mood
          observations and logged days; a missing mood remains blank. Filter the
          mood view by year and optionally overlay an activity’s recorded
          fraction.
        </p>
        <div className="insight-rhythm-controls">
          <label className="insights-field">
            <span>Year filter</span>
            <select
              className="insights-select"
              value={view.year}
              onChange={(event) =>
                logic.chooseRhythmYear({ value: event.target.value })
              }
            >
              <option value="">All years</option>
              {view.yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>
          <label className="insights-field">
            <span>Activity overlay</span>
            <select
              className="insights-select"
              value={logic.state.overlayActivityId}
              onChange={(event) =>
                logic.chooseOverlayActivity({ activityId: event.target.value })
              }
            >
              <option value="">No activity overlay</option>
              {[...activities]
                .toSorted(
                  (a, b) =>
                    a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
                )
                .map((activity) => (
                  <option key={activity.id} value={activity.id}>
                    {activity.name}
                    {activity.archived ? " (archived)" : ""}
                  </option>
                ))}
            </select>
          </label>
        </div>
        {view.analysis.loggedCount === 0 ? (
          <div className="insights-empty">
            No logged days fall inside this range yet.
          </div>
        ) : (
          <>
            <RhythmChart
              title="Mood by weekday"
              buckets={view.analysis.weekdays}
              moods={moods}
              overlayActivityName={view.overlayActivityName}
            />
            <RhythmChart
              title="Mood by month"
              buckets={view.analysis.months}
              moods={moods}
              overlayActivityName={view.overlayActivityName}
            />
            <YearComparison analysis={view.analysis} />
          </>
        )}
      </section>
      <BestWeeksSection
        analysis={view.bestWeeks}
        activities={activities}
        groups={groups}
      />
    </div>
  );
}
