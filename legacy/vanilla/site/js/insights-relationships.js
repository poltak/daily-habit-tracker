import {
  ACTIVITY_PAIR_GROUPS,
  compareActivityCalendarDays,
  compareActivityMood,
  compareActivityPair,
  rankActivityMoodAssociations,
  rankActivityPairs,
} from "../lib/insights-relationships.js";
import { create, html, place, set, syncChildren } from "./dom.js";
import { memo, moodFace, sameProps } from "./ui.js";

/** @import { Activity, ActivityGroup, Mood } from "../lib/daylio.js" */
/** @import { InsightsDay } from "../lib/insights.js" */
/** @import { ActivityMoodAssociation, ActivityPairComparison, ActivityPairGroup, RelationshipMoodSummary } from "../lib/insights-relationships.js" */
/** @typedef {{ days: InsightsDay[]; moods: Mood[]; activities: Activity[]; groups: ActivityGroup[] }} RelationshipInsightsProps */

/** @type {Record<ActivityPairGroup, string>} */
const PAIR_GROUP_LABELS = {
  neither: "Neither activity",
  aOnly: "A only",
  bOnly: "B only",
  both: "Both activities",
};

/** @param {{ groups: ActivityGroup[]; activities: Activity[]; days: InsightsDay[] }} input */
function activitySort({ groups, activities, days }) {
  const groupOrder = new Map(groups.map((group, index) => [group.id, group.sortOrder ?? index]));
  const observedIds = new Set(days.flatMap((day) => day.activityIds));
  const source = activities.filter((activity) => !activity.archived || observedIds.has(activity.id));
  const sortedSource = source.length ? source : activities;
  return [...sortedSource].sort((a, b) => {
    const groupDifference = (groupOrder.get(a.groupId) ?? Number.MAX_SAFE_INTEGER) - (groupOrder.get(b.groupId) ?? Number.MAX_SAFE_INTEGER);
    return groupDifference || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
  });
}

/** @param {number | null} value */
function formatMean(value) {
  return value === null ? "—" : `${value.toFixed(2)}/5`;
}

/** @param {number | null} value */
function formatRate(value) {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

/** @param {number | null} value */
function formatDifference(value) {
  if (value === null) return "No comparison";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)} mood points`;
}

/** @param {Activity | undefined} activity */
function displayActivityName(activity) {
  if (!activity) return "Unknown activity";
  return activity.archived ? `${activity.name} (archived)` : activity.name;
}

/** @param {RelationshipMoodSummary} summary */
function summaryLine(summary) {
  if (summary.sampleSize === 0) return "No known mood observations";
  return `${summary.sampleSize} ${summary.sampleSize === 1 ? "day" : "days"} · average ${formatMean(summary.mean)} · good mood ${formatRate(summary.goodRate)}`;
}

/** @param {RelationshipMoodSummary} summary @param {Mood[]} moods */
function distributionLine(summary, moods) {
  if (summary.sampleSize === 0) return "No known mood observations";
  const names = new Map(moods.map((mood) => [mood.id, mood.name]));
  return summary.distribution
    .filter((item) => item.count > 0)
    .map((item) => `${names.get(item.moodId) ?? item.moodId} ${item.count}`)
    .join(" · ");
}

/** @param {{ summary: RelationshipMoodSummary; moods: Mood[]; label: string; compact?: boolean }} input */
function moodDistribution({ summary, moods, label, compact = false }) {
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
  return html`
    <div class="insight-rel-distribution ${compact ? "insight-rel-distribution-compact" : ""}">
      <svg class="insight-rel-distribution-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}. ${chartDescription || "No mood observations"}">
        <title>${label}</title>
        <desc>${chartDescription || "No mood observations"}</desc>
        <line x1="10" y1="${chartBottom + 0.5}" x2="${width - 10}" y2="${chartBottom + 0.5}" class="insight-rel-chart-axis"></line>
        ${orderedMoods.map((mood, index) => {
          const count = counts[index];
          const percentage = percentages[index];
          const barHeight = count ? Math.max(2, (percentage / 100) * chartHeight) : 0;
          const x = 10 + index * ((width - 20) / Math.max(1, orderedMoods.length)) + (((width - 20) / Math.max(1, orderedMoods.length)) - barWidth) / 2;
          const y = chartBottom - barHeight;
          return html`
            <g>
              <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="5" fill="${mood.color || "var(--accent)"}" class="insight-rel-chart-bar"><title>${mood.name}: ${count} (${Math.round(percentage)}%)</title></rect>
              ${count > 0 ? html`<text x="${x + barWidth / 2}" y="${Math.max(8, y - 4)}" text-anchor="middle" class="insight-rel-chart-count">${count}</text>` : ""}
              ${moodFace({ score: mood.score, color: mood.color, svgAttributes: { x: x + barWidth / 2 - 7, y: chartBottom + 6, width: 14, height: 14 } })}
            </g>`;
        })}
      </svg>
      <div class="insights-legend insight-rel-distribution-legend" aria-hidden="true">
        ${orderedMoods.map((mood) => html`<span><i style="background-color:${mood.color || "var(--accent)"}"></i>${mood.name}</span>`)}
      </div>
    </div>`;
}

/** @param {{ recorded: RelationshipMoodSummary; notRecorded: RelationshipMoodSummary }} input */
function meanBars({ recorded, notRecorded }) {
  const rows = [
    { label: "Recorded", summary: recorded },
    { label: "Not recorded", summary: notRecorded },
  ];
  return html`
    <div class="insight-rel-mean-bars" aria-label="Average mood comparison">
      ${rows.map(({ label, summary }) => html`
        <div class="insight-rel-mean-row">
          <span>${label}</span>
          <div class="insight-rel-mean-track" aria-hidden="true"><i style="width:${summary.mean === null ? "0%" : `${Math.max(0, Math.min(100, summary.mean / 5 * 100))}%`}"></i></div>
          <strong>${formatMean(summary.mean)}</strong>
          <small>n=${summary.sampleSize}</small>
        </div>`)}
    </div>`;
}

/** @param {Activity | undefined} activity */
function activityIcon(activity) {
  return activity?.icon || "check_circle";
}

/** @param {ActivityPairComparison} pair @param {Map<string, Activity>} activityById */
function pairLabel(pair, activityById) {
  return `${displayActivityName(activityById.get(pair.activityAId) ?? undefined)} + ${displayActivityName(activityById.get(pair.activityBId) ?? undefined)}`;
}

/** @param {{ title: string; summary: RelationshipMoodSummary; moods: Mood[]; compact?: boolean }} input */
function summaryCard({ title, summary, moods, compact = false }) {
  return html`
    <article class="insight-rel-summary-card ${summary.sampleSize < 10 ? "insight-rel-summary-sparse" : ""}">
      <div class="insight-rel-summary-heading">
        <h4>${title}</h4>
        <span>n=${summary.sampleSize}</span>
      </div>
      <p class="insight-rel-summary-line">${summaryLine(summary)}</p>
      ${summary.sampleSize ? moodDistribution({ summary, moods, label: `${title} mood distribution`, compact }) : html`<p class="insights-empty insight-rel-summary-empty">No known mood observations for this group.</p>`}
      ${summary.sampleSize ? html`<p class="insight-rel-distribution-text">${distributionLine(summary, moods)}</p>` : ""}
    </article>`;
}

/** @param {Activity[]} activities */
function activityOptions(activities) {
  return activities.map((activity) => html`<option value="${activity.id}">${displayActivityName(activity)}</option>`);
}

/**
 * Activity and mood associations, the days around an activity day, and activity pairs.
 * @param {{ props: RelationshipInsightsProps; invalidate: () => void }} input
 */
export function createRelationshipInsights({ props: initialProps, invalidate }) {
  const visibleActivitiesMemo = memo();
  const yearsMemo = memo();
  const associationsMemo = memo();
  const calendarMemo = memo();
  const pairResultsMemo = memo();
  const selectedPairMemo = memo();
  /** @param {RelationshipInsightsProps} props @returns {Activity[]} */
  const visibleActivitiesFor = ({ activities, days, groups }) => visibleActivitiesMemo([activities, days, groups], () => activitySort({ groups, activities, days }));

  let activitySelection = visibleActivitiesFor(initialProps)[0]?.id ?? "";
  let pairActivityASelection = "";
  let pairActivityBSelection = "";
  let year = "all";
  let weekday = "all";
  // The block renders only when its props or its own selections change. A render of the page for another reason skips it.
  /** @type {RelationshipInsightsProps | null} */
  let renderedProps = null;
  let selectionChanged = false;
  const changed = () => {
    selectionChanged = true;
    invalidate();
  };

  const node = create(html`
    <div class="insight-relations">
      <section id="insights-activities" class="insights-card insight-rel-section">
        <div class="insights-card-heading insight-rel-heading">
          <div>
            <p class="insights-kicker">Activity associations</p>
            <h2>Which activities show up with better moods?</h2>
          </div>
        </div>
        <p class="insights-help">This ranks logged activities by the difference in average mood on days they were recorded versus days they were not. It describes an association in your entries and cannot show that an activity caused a mood.</p>
        <div class="insight-rel-controls">
          <label class="insights-field"><span>Year</span><select class="insights-select" data-action="rel-year"></select></label>
          <label class="insights-field"><span>Weekday</span><select class="insights-select" data-action="rel-weekday"><option value="all">All weekdays</option>${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((item, index) => html`<option value="${index}">${item}</option>`)}</select></label>
          <label class="insights-field insight-rel-activity-picker"><span>Activity detail</span><select class="insights-select" data-action="rel-activity"></select></label>
        </div>
        <div class="insight-rel-association-layout">
          <div class="insight-rel-ranking-panel">
            <div class="insight-rel-subheading"><h3>Ranked associations</h3><span></span></div>
          </div>
          <div class="insight-rel-detail-panel"></div>
        </div>
      </section>

      <section id="insights-next-day" class="insights-card insight-rel-section">
        <div class="insights-card-heading insight-rel-heading">
          <div><p class="insights-kicker">Calendar-day window</p><h2>What happens around an activity day?</h2></div>
        </div>
        <p class="insights-help">For each anchor day, this compares the previous, same, next, and two-days-after calendar dates in the selected insights range. Dates are matched exactly; missing dates are omitted and never replaced by the next logged row.</p>
        <label class="insights-field insight-rel-window-picker"><span>Activity</span><select class="insights-select" data-action="rel-activity"></select></label>
      </section>

      <section id="insights-combinations" class="insights-card insight-rel-section">
        <div class="insights-card-heading insight-rel-heading">
          <div><p class="insights-kicker">Activity combinations</p><h2>Which pairs have a useful mood split?</h2></div>
        </div>
        <p class="insights-help">Suggestions appear only when each of four groups has at least 10 known mood observations: neither activity, A only, B only, and both. Pair differences describe logged-day associations and do not establish causation.</p>
        <div class="insight-rel-pair-picker-wrap">
          <label class="insights-field"><span>First activity</span><select class="insights-select" data-action="rel-pair-a"></select></label>
          <label class="insights-field"><span>Second activity</span><select class="insights-select" data-action="rel-pair-b"></select></label>
        </div>
      </section>
    </div>`);
  const [associationSection, windowSection, pairSection] = /** @type {HTMLElement[]} */ ([...node.children]);
  /** @param {Element} root @param {string} selector @returns {any} */
  const find = (root, selector) => root.querySelector(selector);
  const yearSelect = find(associationSection, '[data-action="rel-year"]');
  const weekdaySelect = find(associationSection, '[data-action="rel-weekday"]');
  const detailSelect = find(associationSection, '[data-action="rel-activity"]');
  const rankingPanel = find(associationSection, ".insight-rel-ranking-panel");
  const rankingCount = find(associationSection, ".insight-rel-subheading span");
  const detailPanel = find(associationSection, ".insight-rel-detail-panel");
  const rankingList = create(html`<div class="insight-rel-ranking-list" role="group" aria-label="Activity mood associations"></div>`);
  const rankingEmpty = create(html`<p class="insights-empty"></p>`);
  const windowSelect = find(windowSection, "select");
  const windowMeta = create(html`<div class="insight-rel-window-meta"></div>`);
  const windowList = create(html`<div class="insight-rel-window-list"></div>`);
  const windowEmpty = create(html`<p class="insights-empty">Choose an activity to compare exact calendar-day windows.</p>`);
  const pairPickers = find(pairSection, ".insight-rel-pair-picker-wrap");
  const [pairSelectA, pairSelectB] = pairPickers.querySelectorAll("select");
  const suggestionList = create(html`<div class="insight-rel-pair-suggestions" role="group" aria-label="Suggested activity pairs"></div>`);
  const suggestionEmpty = create(html`<p class="insights-empty">No pair meets the 10-observation threshold in all four groups yet. You can still explore a sparse pair below.</p>`);
  const pairDetail = create(html`<div class="insight-rel-pair-detail"></div>`);
  const pairEmpty = create(html`<p class="insights-empty">Add at least two activities and log days with known moods to explore combinations.</p>`);

  /** @param {RelationshipInsightsProps} props */
  function update(props) {
    if (!selectionChanged && sameProps(renderedProps, props)) return;
    renderedProps = props;
    selectionChanged = false;
    const { days, moods } = props;
    const visibleActivities = visibleActivitiesFor(props);
    const activityById = new Map(visibleActivities.map((activity) => [activity.id, activity]));
    const selectedActivityId = visibleActivities.find((activity) => activity.id === activitySelection)?.id ?? visibleActivities[0]?.id ?? "";
    /** @type {string[]} */
    const years = yearsMemo([days], () => [...new Set(days.map((day) => day.logicalDate.slice(0, 4)).filter((value) => /^\d{4}$/.test(value)))].sort((a, b) => b.localeCompare(a)));
    const selectedYear = year === "all" || years.includes(year) ? year : "all";
    /** @type {ActivityMoodAssociation[]} */
    const associations = associationsMemo([days, moods, selectedYear, weekday, visibleActivities], () => rankActivityMoodAssociations({
      days,
      moods,
      activities: visibleActivities,
      filter: { year: selectedYear === "all" ? null : Number(selectedYear), weekday: weekday === "all" ? null : Number(weekday) },
    }));
    const selectedAssociation = associations.find((association) => association.activityId === selectedActivityId) ?? (selectedActivityId ? compareActivityMood({ days: [], moods, activityId: selectedActivityId }) : undefined);
    const calendarComparison = calendarMemo([days, moods, selectedActivityId], () => selectedActivityId ? compareActivityCalendarDays({ days, moods, activityId: selectedActivityId }) : null);
    const pairResults = pairResultsMemo([days, moods, visibleActivities], () => rankActivityPairs({ days, moods, activities: visibleActivities, minObservations: 10, limit: 5 }));
    const fallbackPair = pairResults.suggestions[0] ?? pairResults.comparisons[0];
    const pairActivityAId = visibleActivities.some((activity) => activity.id === pairActivityASelection)
      ? pairActivityASelection
      : fallbackPair?.activityAId ?? visibleActivities[0]?.id ?? "";
    const pairActivityBId = visibleActivities.some((activity) => activity.id === pairActivityBSelection && activity.id !== pairActivityAId)
      ? pairActivityBSelection
      : fallbackPair && fallbackPair.activityAId === pairActivityAId
        ? fallbackPair.activityBId
        : visibleActivities.find((activity) => activity.id !== pairActivityAId)?.id ?? "";
    /** @type {ActivityPairComparison | null} */
    const selectedPair = selectedPairMemo([days, moods, pairActivityAId, pairActivityBId], () => pairActivityAId && pairActivityBId
      ? compareActivityPair({ days, moods, activityAId: pairActivityAId, activityBId: pairActivityBId, minObservations: 10 })
      : null);
    const hasDays = days.length > 0;
    const hasMoods = moods.length > 0;
    const selectedActivity = activityById.get(selectedActivityId);
    const allActivityOptions = html`${activityOptions(visibleActivities)}`;

    // Activity associations
    set(yearSelect, { html: html`<option value="all">All years</option>${years.map((item) => html`<option value="${item}">${item}</option>`)}`, value: selectedYear });
    set(weekdaySelect, { value: weekday });
    set(detailSelect, { html: allActivityOptions, value: selectedActivityId, disabled: !visibleActivities.length });
    set(rankingCount, { text: associations.length ? `${associations.length} with mood data` : "No data" });
    place({ node: rankingList, present: associations.length > 0, parent: rankingPanel });
    place({ node: rankingEmpty, present: associations.length === 0, parent: rankingPanel });
    set(rankingEmpty, { text: !hasDays || !hasMoods ? "Log days with a known mood to see activity associations." : "There are no known mood observations in this filter." });
    syncChildren({
      parent: rankingList,
      items: associations,
      key: (association) => association.activityId,
      create: (association) => create(html`<button type="button" data-action="rel-rank" data-id="${association.activityId}"></button>`),
      update: (button, association, index) => {
        const activity = activityById.get(association.activityId);
        const selected = association.activityId === selectedActivityId;
        set(button, {
          "aria-pressed": selected,
          class: `insight-rel-ranking-row ${selected ? "selected" : ""}`,
          html: html`
            <span class="insight-rel-rank">${index + 1}</span>
            <span class="insight-rel-activity-icon material-symbols-rounded" aria-hidden="true">${activityIcon(activity)}</span>
            <span class="insight-rel-ranking-copy"><strong>${activity ? displayActivityName(activity) : association.activityId}</strong><small>${association.recorded.sampleSize} recorded · ${association.notRecorded.sampleSize} not recorded${association.sparse ? " · sparse" : ""}</small></span>
            <span class="insight-rel-ranking-delta ${association.meanDifference !== null && association.meanDifference >= 0 ? "positive" : "negative"}">${formatDifference(association.meanDifference)}</span>`,
        });
      },
    });
    set(detailPanel, {
      html: html`
        <div class="insight-rel-subheading">
          <div><h3>${selectedActivity ? displayActivityName(selectedActivity) : "Activity detail"}</h3><p>Recorded versus not recorded</p></div>
          ${selectedAssociation ? html`<strong class="insight-rel-detail-delta ${selectedAssociation.meanDifference !== null && selectedAssociation.meanDifference >= 0 ? "positive" : "negative"}">${formatDifference(selectedAssociation.meanDifference)}</strong>` : ""}
        </div>
        ${selectedAssociation && (selectedAssociation.recorded.sampleSize || selectedAssociation.notRecorded.sampleSize)
          ? html`<div class="insight-rel-summary-grid">${summaryCard({ title: "Activity recorded", summary: selectedAssociation.recorded, moods })}${summaryCard({ title: "Activity not recorded", summary: selectedAssociation.notRecorded, moods })}</div>`
          : html`<p class="insights-empty">Select an activity with known mood observations to inspect both distributions.</p>`}
        ${selectedAssociation?.sparse ? html`<p class="insight-rel-sparse-note">This comparison is sparse (${selectedAssociation.sparseGroups.map((group) => `${group === "recorded" ? "recorded" : "not recorded"} n=${selectedAssociation[group].sampleSize}`).join(" · ")}); treat the displayed association as exploratory.</p>` : ""}`,
    });

    // The days around an activity day
    set(windowSelect, { html: allActivityOptions, value: selectedActivityId, disabled: !visibleActivities.length });
    const hasWindow = Boolean(calendarComparison && selectedActivity);
    place({ node: windowList, present: hasWindow, parent: windowSection });
    place({ node: windowMeta, present: hasWindow, parent: windowSection, before: windowList });
    place({ node: windowEmpty, present: !hasWindow, parent: windowSection });
    if (calendarComparison && selectedActivity) {
      set(windowMeta, { html: html`<span><strong>${displayActivityName(selectedActivity)}</strong> anchor days</span><span>${calendarComparison.anchorCounts.recorded} recorded · ${calendarComparison.anchorCounts.notRecorded} not recorded</span>` });
      set(windowList, {
        html: calendarComparison.offsets.map((offset) => html`
          <article class="insight-rel-window-row">
            <div class="insight-rel-window-title"><h3>${offset.label}</h3><p>${offset.recorded.sampleSize + offset.notRecorded.sampleSize} exact mood observations</p></div>
            ${meanBars({ recorded: offset.recorded, notRecorded: offset.notRecorded })}
            <div class="insight-rel-window-distributions"><div><strong>Recorded on anchor</strong><span>${distributionLine(offset.recorded, moods)}</span></div><div><strong>Not recorded on anchor</strong><span>${distributionLine(offset.notRecorded, moods)}</span></div></div>
          </article>`),
      });
    }

    // Activity pairs
    const hasSuggestions = pairResults.suggestions.length > 0;
    place({ node: suggestionList, present: hasSuggestions, parent: pairSection, before: pairPickers });
    place({ node: suggestionEmpty, present: !hasSuggestions, parent: pairSection, before: pairPickers });
    syncChildren({
      parent: suggestionList,
      items: pairResults.suggestions,
      key: (pair) => pair.pairKey,
      create: (pair) => create(html`<button type="button" data-action="rel-pair" data-a="${pair.activityAId}" data-b="${pair.activityBId}"></button>`),
      update: (button, pair) => set(button, {
        "aria-pressed": selectedPair?.pairKey === pair.pairKey,
        class: `insight-rel-pair-suggestion ${selectedPair?.pairKey === pair.pairKey ? "selected" : ""}`,
        html: html`<span class="insight-rel-pair-suggestion-icon material-symbols-rounded" aria-hidden="true">compare_arrows</span><span><strong>${pairLabel(pair, activityById)}</strong><small>${pair.meanRange === null ? "No mean range" : `${pair.meanRange.toFixed(2)} point spread across groups`}</small></span>`,
      }),
    });
    set(pairSelectA, { html: html`${activityOptions(visibleActivities.filter((activity) => activity.id !== pairActivityBId))}`, value: pairActivityAId, disabled: visibleActivities.length < 2 });
    set(pairSelectB, { html: html`${activityOptions(visibleActivities.filter((activity) => activity.id !== pairActivityAId))}`, value: pairActivityBId, disabled: visibleActivities.length < 2 });
    place({ node: pairDetail, present: Boolean(selectedPair), parent: pairSection });
    place({ node: pairEmpty, present: !selectedPair, parent: pairSection });
    if (selectedPair) {
      set(pairDetail, {
        html: html`
          <div class="insight-rel-subheading">
            <div><h3>${pairLabel(selectedPair, activityById)}</h3><p>Compare the four logged-day groups</p></div>
            <span class="insight-rel-adequacy ${selectedPair.adequate ? "adequate" : "sparse"}">${selectedPair.adequate ? "Adequate sample" : `Sparse: ${selectedPair.sparseGroups.length} group${selectedPair.sparseGroups.length === 1 ? "" : "s"}`}</span>
          </div>
          <div class="insight-rel-pair-grid">${ACTIVITY_PAIR_GROUPS.map((group) => summaryCard({
            title: group === "aOnly" ? `${activityById.get(selectedPair.activityAId)?.name ?? "A"} only` : group === "bOnly" ? `${activityById.get(selectedPair.activityBId)?.name ?? "B"} only` : PAIR_GROUP_LABELS[group],
            summary: selectedPair.groups[group],
            moods,
            compact: true,
          }))}</div>
          ${!selectedPair.adequate ? html`<p class="insight-rel-sparse-note">This pair is available for manual exploration, but the small group(s) make its distribution unstable: ${selectedPair.sparseGroups.map((group) => `${PAIR_GROUP_LABELS[group]} n=${selectedPair.sampleSizes[group]}`).join(" · ")}.</p>` : ""}`,
      });
    }
  }

  return {
    node,
    update,
    handlers: {
      click: {
        "rel-rank": (/** @type {HTMLElement} */ button) => {
          activitySelection = button.dataset.id ?? "";
          changed();
        },
        "rel-pair": (/** @type {HTMLElement} */ button) => {
          pairActivityASelection = button.dataset.a ?? "";
          pairActivityBSelection = button.dataset.b ?? "";
          changed();
        },
      },
      change: {
        "rel-year": (/** @type {HTMLSelectElement} */ select) => {
          year = select.value;
          changed();
        },
        "rel-weekday": (/** @type {HTMLSelectElement} */ select) => {
          weekday = select.value;
          changed();
        },
        "rel-activity": (/** @type {HTMLSelectElement} */ select) => {
          activitySelection = select.value;
          changed();
        },
        "rel-pair-a": (/** @type {HTMLSelectElement} */ select) => {
          pairActivityASelection = select.value;
          changed();
        },
        "rel-pair-b": (/** @type {HTMLSelectElement} */ select) => {
          pairActivityBSelection = select.value;
          changed();
        },
      },
    },
  };
}
