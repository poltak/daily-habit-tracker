"use client";

import { useMemo, useState } from "react";
import type { Activity, ActivityGroup, Mood } from "../../lib/daylio.ts";
import type { InsightsDay } from "../../lib/insights.ts";
import {
  ACTIVITY_PAIR_GROUPS,
  compareActivityCalendarDays,
  compareActivityMood,
  rankActivityMoodAssociations,
  rankActivityPairs,
  type ActivityMoodAssociation,
  type ActivityPairComparison,
  type ActivityPairGroup,
  type RelationshipDayFilter,
  type RelationshipMoodSummary,
} from "../../lib/insights-relationships.ts";
import "./insights-relationships.css";

type RelationshipInsightsProps = {
  days: InsightsDay[];
  moods: Mood[];
  activities: Activity[];
  groups: ActivityGroup[];
};

const PAIR_GROUP_LABELS: Record<ActivityPairGroup, string> = {
  neither: "Neither activity",
  aOnly: "A only",
  bOnly: "B only",
  both: "Both activities",
};

function activitySort({ groups, activities, days }: { groups: ActivityGroup[]; activities: Activity[]; days: InsightsDay[] }) {
  const groupOrder = new Map(groups.map((group, index) => [group.id, group.sortOrder ?? index]));
  const observedIds = new Set(days.flatMap((day) => day.activityIds));
  const source = activities.filter((activity) => !activity.archived || observedIds.has(activity.id));
  const sortedSource = source.length ? source : activities;
  return [...sortedSource].sort((a, b) => {
    const groupDifference = (groupOrder.get(a.groupId) ?? Number.MAX_SAFE_INTEGER) - (groupOrder.get(b.groupId) ?? Number.MAX_SAFE_INTEGER);
    return groupDifference || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
  });
}

function formatMean(value: number | null) {
  return value === null ? "—" : `${value.toFixed(2)}/5`;
}

function formatRate(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function formatDifference(value: number | null) {
  if (value === null) return "No comparison";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} mood points`;
}

function displayActivityName(activity: Activity | undefined) {
  if (!activity) return "Unknown activity";
  return activity.archived ? `${activity.name} (archived)` : activity.name;
}

function summaryLine(summary: RelationshipMoodSummary) {
  if (summary.sampleSize === 0) return "No known mood observations";
  return `${summary.sampleSize} ${summary.sampleSize === 1 ? "day" : "days"} · average ${formatMean(summary.mean)} · good mood ${formatRate(summary.goodRate)}`;
}

function distributionLine(summary: RelationshipMoodSummary, moods: Mood[]) {
  if (summary.sampleSize === 0) return "No known mood observations";
  const names = new Map(moods.map((mood) => [mood.id, mood.name]));
  return summary.distribution
    .filter((item) => item.count > 0)
    .map((item) => `${names.get(item.moodId) ?? item.moodId} ${item.count}`)
    .join(" · ");
}

function MoodDistribution({
  summary,
  moods,
  label,
  compact = false,
}: {
  summary: RelationshipMoodSummary;
  moods: Mood[];
  label: string;
  compact?: boolean;
}) {
  const orderedMoods = [...moods].sort((a, b) => a.score - b.score);
  const counts = orderedMoods.map((mood) => summary.distribution.find((item) => item.moodId === mood.id)?.count ?? 0);
  const width = Math.max(220, orderedMoods.length * (compact ? 45 : 54));
  const height = compact ? 94 : 130;
  const chartTop = 9;
  const chartBottom = compact ? 65 : 91;
  const chartHeight = chartBottom - chartTop;
  const barWidth = Math.max(16, Math.min(34, (width - 20) / Math.max(1, orderedMoods.length) - 10));
  const percentages = counts.map((count) => summary.sampleSize ? count / summary.sampleSize * 100 : 0);
  const chartDescription = orderedMoods.map((mood, index) => `${mood.name}: ${counts[index]} (${Math.round(percentages[index])}%)`).join(", ");
  return (
    <div className={`insight-rel-distribution ${compact ? "insight-rel-distribution-compact" : ""}`}>
      <svg
        className="insight-rel-distribution-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${label}. ${chartDescription || "No mood observations"}`}
      >
        <title>{label}</title>
        <desc>{chartDescription || "No mood observations"}</desc>
        <line x1="10" y1={chartBottom + 0.5} x2={width - 10} y2={chartBottom + 0.5} className="insight-rel-chart-axis" />
        {orderedMoods.map((mood, index) => {
          const count = counts[index];
          const percentage = percentages[index];
          const barHeight = count ? Math.max(2, (percentage / 100) * chartHeight) : 0;
          const x = 10 + index * ((width - 20) / Math.max(1, orderedMoods.length)) + (((width - 20) / Math.max(1, orderedMoods.length)) - barWidth) / 2;
          const y = chartBottom - barHeight;
          return (
            <g key={mood.id}>
              <rect x={x} y={y} width={barWidth} height={barHeight} rx="5" fill={mood.color || "var(--accent)"} className="insight-rel-chart-bar">
                <title>{`${mood.name}: ${count} (${Math.round(percentage)}%)`}</title>
              </rect>
              {count > 0 ? <text x={x + barWidth / 2} y={Math.max(8, y - 4)} textAnchor="middle" className="insight-rel-chart-count">{count}</text> : null}
              <text x={x + barWidth / 2} y={chartBottom + 17} textAnchor="middle" className="insight-rel-chart-label">{mood.emoji}</text>
            </g>
          );
        })}
      </svg>
      <div className="insights-legend insight-rel-distribution-legend" aria-hidden="true">
        {orderedMoods.map((mood) => <span key={mood.id}><i style={{ backgroundColor: mood.color || "var(--accent)" }} />{mood.name}</span>)}
      </div>
    </div>
  );
}

function MeanBars({ recorded, notRecorded, recordedLabel = "Recorded", notRecordedLabel = "Not recorded" }: { recorded: RelationshipMoodSummary; notRecorded: RelationshipMoodSummary; recordedLabel?: string; notRecordedLabel?: string }) {
  const rows = [
    { label: recordedLabel, summary: recorded, key: "recorded" },
    { label: notRecordedLabel, summary: notRecorded, key: "not-recorded" },
  ];
  return (
    <div className="insight-rel-mean-bars" aria-label="Average mood comparison">
      {rows.map(({ label, summary, key }) => (
        <div className="insight-rel-mean-row" key={key}>
          <span>{label}</span>
          <div className="insight-rel-mean-track" aria-hidden="true"><i style={{ width: summary.mean === null ? "0%" : `${Math.max(0, Math.min(100, summary.mean / 5 * 100))}%` }} /></div>
          <strong>{formatMean(summary.mean)}</strong>
          <small>n={summary.sampleSize}</small>
        </div>
      ))}
    </div>
  );
}

function activityIcon(activity: Activity | undefined) {
  return activity?.icon || "check_circle";
}

function pairLabel(pair: ActivityPairComparison, activityById: Map<string, Activity>) {
  return `${displayActivityName(activityById.get(pair.activityAId) ?? undefined)} + ${displayActivityName(activityById.get(pair.activityBId) ?? undefined)}`;
}

function SummaryCard({ title, summary, moods, compact = false }: { title: string; summary: RelationshipMoodSummary; moods: Mood[]; compact?: boolean }) {
  return (
    <article className={`insight-rel-summary-card ${summary.sampleSize < 10 ? "insight-rel-summary-sparse" : ""}`}>
      <div className="insight-rel-summary-heading">
        <h4>{title}</h4>
        <span>n={summary.sampleSize}</span>
      </div>
      <p className="insight-rel-summary-line">{summaryLine(summary)}</p>
      {summary.sampleSize ? <MoodDistribution summary={summary} moods={moods} label={`${title} mood distribution`} compact={compact} /> : <p className="insights-empty insight-rel-summary-empty">No known mood observations for this group.</p>}
      {summary.sampleSize ? <p className="insight-rel-distribution-text">{distributionLine(summary, moods)}</p> : null}
    </article>
  );
}

export function RelationshipInsights({ days, moods, activities, groups }: RelationshipInsightsProps) {
  const visibleActivities = useMemo(() => activitySort({ groups, activities, days }), [activities, days, groups]);
  const activityById = useMemo(() => new Map(visibleActivities.map((activity) => [activity.id, activity])), [visibleActivities]);
  const [activitySelection, setActivitySelection] = useState(() => visibleActivities[0]?.id ?? "");
  const [selectedPairKey, setSelectedPairKey] = useState("");
  const [year, setYear] = useState("all");
  const [weekday, setWeekday] = useState("all");

  const selectedActivityId = visibleActivities.find((activity) => activity.id === activitySelection)?.id ?? visibleActivities[0]?.id ?? "";

  const years = useMemo(() => [...new Set(days.map((day) => day.logicalDate.slice(0, 4)).filter((value) => /^\d{4}$/.test(value)))].sort((a, b) => b.localeCompare(a)), [days]);
  const selectedYear = year === "all" || years.includes(year) ? year : "all";
  const relationshipFilter = useMemo<RelationshipDayFilter>(() => ({
    year: selectedYear === "all" ? null : Number(selectedYear),
    weekday: weekday === "all" ? null : Number(weekday),
  }), [selectedYear, weekday]);
  const associations = useMemo(() => rankActivityMoodAssociations({ days, moods, activities: visibleActivities, filter: relationshipFilter }), [days, moods, relationshipFilter, visibleActivities]);
  const selectedAssociation: ActivityMoodAssociation | undefined = associations.find((association) => association.activityId === selectedActivityId) ?? (selectedActivityId ? compareActivityMood({ days: [], moods, activityId: selectedActivityId }) : undefined);
  const calendarComparison = useMemo(() => selectedActivityId ? compareActivityCalendarDays({ days, moods, activityId: selectedActivityId }) : null, [days, moods, selectedActivityId]);
  const pairResults = useMemo(() => rankActivityPairs({ days, moods, activities: visibleActivities, minObservations: 10 }), [days, moods, visibleActivities]);
  const selectedPair = pairResults.comparisons.find((pair) => pair.pairKey === selectedPairKey) ?? pairResults.suggestions[0] ?? pairResults.comparisons[0];

  const hasDays = days.length > 0;
  const hasMoods = moods.length > 0;
  const selectedActivity = activityById.get(selectedActivityId);

  return (
    <div className="insight-relations">
      <section id="insights-activities" className="insights-card insight-rel-section">
        <div className="insights-card-heading insight-rel-heading">
          <div>
            <p className="insights-kicker">Activity associations</p>
            <h2>Which activities show up with better moods?</h2>
          </div>
        </div>
        <p className="insights-help">This ranks logged activities by the difference in average mood on days they were recorded versus days they were not. It describes an association in your entries and cannot show that an activity caused a mood.</p>
        <div className="insight-rel-controls">
          <label className="insights-field"><span>Year</span><select className="insights-select" value={selectedYear} onChange={(event) => setYear(event.target.value)}><option value="all">All years</option>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="insights-field"><span>Weekday</span><select className="insights-select" value={weekday} onChange={(event) => setWeekday(event.target.value)}><option value="all">All weekdays</option>{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((item, index) => <option key={item} value={index}>{item}</option>)}</select></label>
          <label className="insights-field insight-rel-activity-picker"><span>Activity detail</span><select className="insights-select" value={selectedActivityId} onChange={(event) => setActivitySelection(event.target.value)} disabled={!visibleActivities.length}>{visibleActivities.map((activity) => <option key={activity.id} value={activity.id}>{displayActivityName(activity)}</option>)}</select></label>
        </div>
        <div className="insight-rel-association-layout">
          <div className="insight-rel-ranking-panel">
            <div className="insight-rel-subheading"><h3>Ranked associations</h3><span>{associations.length ? `${associations.length} with mood data` : "No data"}</span></div>
            {associations.length ? <div className="insight-rel-ranking-list" role="listbox" aria-label="Activity mood associations">
              {associations.map((association, index) => {
                const activity = activityById.get(association.activityId);
                const selected = association.activityId === selectedActivityId;
                return <button type="button" role="option" aria-selected={selected} className={`insight-rel-ranking-row ${selected ? "selected" : ""}`} key={association.activityId} onClick={() => setActivitySelection(association.activityId)}>
                  <span className="insight-rel-rank">{index + 1}</span>
                  <span className="insight-rel-activity-icon material-symbols-rounded" aria-hidden="true">{activityIcon(activity)}</span>
                  <span className="insight-rel-ranking-copy"><strong>{activity ? displayActivityName(activity) : association.activityId}</strong><small>{association.recorded.sampleSize} recorded · {association.notRecorded.sampleSize} not recorded{association.sparse ? " · sparse" : ""}</small></span>
                  <span className={`insight-rel-ranking-delta ${association.meanDifference !== null && association.meanDifference >= 0 ? "positive" : "negative"}`}>{formatDifference(association.meanDifference)}</span>
                </button>;
              })}
            </div> : <p className="insights-empty">{!hasDays || !hasMoods ? "Log days with a known mood to see activity associations." : "There are no known mood observations in this filter."}</p>}
          </div>
          <div className="insight-rel-detail-panel">
            <div className="insight-rel-subheading"><div><h3>{selectedActivity ? displayActivityName(selectedActivity) : "Activity detail"}</h3><p>Recorded versus not recorded</p></div>{selectedAssociation ? <strong className={`insight-rel-detail-delta ${selectedAssociation.meanDifference !== null && selectedAssociation.meanDifference >= 0 ? "positive" : "negative"}`}>{formatDifference(selectedAssociation.meanDifference)}</strong> : null}</div>
            {selectedAssociation && (selectedAssociation.recorded.sampleSize || selectedAssociation.notRecorded.sampleSize) ? <div className="insight-rel-summary-grid"><SummaryCard title="Activity recorded" summary={selectedAssociation.recorded} moods={moods} /><SummaryCard title="Activity not recorded" summary={selectedAssociation.notRecorded} moods={moods} /></div> : <p className="insights-empty">Select an activity with known mood observations to inspect both distributions.</p>}
            {selectedAssociation?.sparse ? <p className="insight-rel-sparse-note">This comparison is sparse ({selectedAssociation.sparseGroups.map((group) => `${group === "recorded" ? "recorded" : "not recorded"} n=${selectedAssociation[group].sampleSize}`).join(" · ")}); treat the displayed association as exploratory.</p> : null}
          </div>
        </div>
      </section>

      <section id="insights-next-day" className="insights-card insight-rel-section">
        <div className="insights-card-heading insight-rel-heading">
          <div><p className="insights-kicker">Calendar-day window</p><h2>What happens around an activity day?</h2></div>
        </div>
        <p className="insights-help">For each anchor day, this compares the previous, same, next, and two-days-after calendar dates in the selected insights range. Dates are matched exactly; missing dates are omitted and never replaced by the next logged row.</p>
        <label className="insights-field insight-rel-window-picker"><span>Activity</span><select className="insights-select" value={selectedActivityId} onChange={(event) => setActivitySelection(event.target.value)} disabled={!visibleActivities.length}>{visibleActivities.map((activity) => <option key={activity.id} value={activity.id}>{displayActivityName(activity)}</option>)}</select></label>
        {calendarComparison && selectedActivity ? <>
          <div className="insight-rel-window-meta"><span><strong>{displayActivityName(selectedActivity)}</strong> anchor days</span><span>{calendarComparison.anchorCounts.recorded} recorded · {calendarComparison.anchorCounts.notRecorded} not recorded</span></div>
          <div className="insight-rel-window-list">
            {calendarComparison.offsets.map((offset) => <article className="insight-rel-window-row" key={offset.offset}>
              <div className="insight-rel-window-title"><h3>{offset.label}</h3><p>{offset.recorded.sampleSize + offset.notRecorded.sampleSize} exact mood observations</p></div>
              <MeanBars recorded={offset.recorded} notRecorded={offset.notRecorded} />
              <div className="insight-rel-window-distributions"><div><strong>Recorded on anchor</strong><span>{distributionLine(offset.recorded, moods)}</span></div><div><strong>Not recorded on anchor</strong><span>{distributionLine(offset.notRecorded, moods)}</span></div></div>
            </article>)}
          </div>
        </> : <p className="insights-empty">Choose an activity to compare exact calendar-day windows.</p>}
      </section>

      <section id="insights-combinations" className="insights-card insight-rel-section">
        <div className="insights-card-heading insight-rel-heading">
          <div><p className="insights-kicker">Activity combinations</p><h2>Which pairs have a useful mood split?</h2></div>
        </div>
        <p className="insights-help">Suggestions appear only when each of four groups has at least 10 known mood observations: neither activity, A only, B only, and both. Pair differences describe logged-day associations and do not establish causation.</p>
        {pairResults.suggestions.length ? <div className="insight-rel-pair-suggestions" role="listbox" aria-label="Suggested activity pairs">
          {pairResults.suggestions.map((pair) => <button type="button" role="option" aria-selected={selectedPair?.pairKey === pair.pairKey} className={`insight-rel-pair-suggestion ${selectedPair?.pairKey === pair.pairKey ? "selected" : ""}`} key={pair.pairKey} onClick={() => setSelectedPairKey(pair.pairKey)}><span className="insight-rel-pair-suggestion-icon material-symbols-rounded" aria-hidden="true">compare_arrows</span><span><strong>{pairLabel(pair, activityById)}</strong><small>{pair.meanRange === null ? "No mean range" : `${pair.meanRange.toFixed(2)} point spread across groups`}</small></span></button>)}
        </div> : <p className="insights-empty">No pair meets the 10-observation threshold in all four groups yet. You can still explore a sparse pair below.</p>}
        <div className="insight-rel-pair-picker-wrap"><label className="insights-field"><span>Explore a pair</span><select className="insights-select" value={selectedPair?.pairKey ?? ""} onChange={(event) => setSelectedPairKey(event.target.value)} disabled={!pairResults.comparisons.length}><option value="">Choose two activities</option>{pairResults.comparisons.map((pair) => <option key={pair.pairKey} value={pair.pairKey}>{pairLabel(pair, activityById)}{pair.adequate ? " · suggested" : " · sparse"}</option>)}</select></label></div>
        {selectedPair ? <div className="insight-rel-pair-detail">
          <div className="insight-rel-subheading"><div><h3>{pairLabel(selectedPair, activityById)}</h3><p>Compare the four logged-day groups</p></div><span className={`insight-rel-adequacy ${selectedPair.adequate ? "adequate" : "sparse"}`}>{selectedPair.adequate ? "Adequate sample" : `Sparse: ${selectedPair.sparseGroups.length} group${selectedPair.sparseGroups.length === 1 ? "" : "s"}`}</span></div>
          <div className="insight-rel-pair-grid">{ACTIVITY_PAIR_GROUPS.map((group) => <SummaryCard key={group} title={group === "aOnly" ? `${activityById.get(selectedPair.activityAId)?.name ?? "A"} only` : group === "bOnly" ? `${activityById.get(selectedPair.activityBId)?.name ?? "B"} only` : PAIR_GROUP_LABELS[group]} summary={selectedPair.groups[group]} moods={moods} compact />)}</div>
          {!selectedPair.adequate ? <p className="insight-rel-sparse-note">This pair is available for manual exploration, but the small group(s) make its distribution unstable: {selectedPair.sparseGroups.map((group) => `${PAIR_GROUP_LABELS[group]} n=${selectedPair.sampleSizes[group]}`).join(" · ")}.</p> : null}
        </div> : <p className="insights-empty">Add at least two activities and log days with known moods to explore combinations.</p>}
      </section>
    </div>
  );
}
