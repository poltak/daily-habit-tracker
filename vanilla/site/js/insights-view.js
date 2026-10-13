import { isLogicalDate, logicalDateFromDate } from "../lib/daylio.js";
import { daysInInsightsRange, insightsDateRange } from "../lib/insights.js";
import { create, html, placeAll, set } from "./dom.js";
import { createRelationshipInsights } from "./insights-relationships.js";
import { createRhythmInsights } from "./insights-rhythms.js";
import { icon, memo } from "./ui.js";

/** @import { InsightsData, InsightsDay } from "../lib/insights.js" */
/** @import { App } from "./app.js" */

const SECTIONS = [
  ["insights-activities", "Activities"],
  ["insights-next-day", "Next day"],
  ["insights-combinations", "Combinations"],
  ["insights-rhythms", "Rhythms"],
  ["insights-best-weeks", "Best weeks"],
];

/** The analysis of the full saved history for a period that the person selects. @param {App} app */
export function createInsightsView(app) {
  const { state } = app;
  /** @type {InsightsData | null} */
  let data = null;
  let error = "";
  let preset = "all";
  let customStart = "";
  let customEnd = "";
  let controller = new AbortController();
  /** @type {ReturnType<typeof createRelationshipInsights> | null} */
  let relationships = null;
  /** @type {ReturnType<typeof createRhythmInsights> | null} */
  let rhythms = null;
  const historyMemo = memo();
  const yearsMemo = memo();
  const daysMemo = memo();
  const activityCountMemo = memo();

  const page = create(html`
    <div class="page-section insights-page">
      <div class="page-intro insights-intro">
        <p class="eyebrow">A little perspective</p>
        <h1>Your everyday, over time.</h1>
        <p class="muted">Explore the activities, rhythms, and combinations that accompany your moods.</p>
      </div>
    </div>`);
  const loadingCard = create(html`<div class="insights-card insights-loading" role="status" aria-busy="true">${icon("insights")}<p>Looking through your journal…</p><span class="insights-help">Loading your full recorded history.</span></div>`);
  const errorCard = create(html`<div class="insights-card" role="alert"><h2>Insights couldn’t load</h2><p class="insights-help"></p><button class="secondary-button" data-action="insights-retry">Try again</button></div>`);
  const toolbar = create(html`
    <div class="insights-toolbar">
      <label class="insights-field"><span>Explore a period</span><select class="insights-select" data-action="insights-period"></select></label>
      <p class="insights-toolbar-note">${icon("auto_graph")}<span>Patterns in your records.<br>A starting point for curiosity.</span></p>
    </div>`);
  const periodSelect = /** @type {HTMLSelectElement} */ (toolbar.querySelector("select"));
  const toolbarNote = /** @type {HTMLElement} */ (toolbar.lastElementChild);
  const customRange = create(html`
    <div class="insights-custom-range">
      <label class="insights-field"><span>From</span><input class="insights-select" type="date" data-action="insights-from"></label>
      <label class="insights-field"><span>To</span><input class="insights-select" type="date" data-action="insights-to"></label>
    </div>`);
  const [fromInput, toInput] = /** @type {HTMLInputElement[]} */ ([...customRange.querySelectorAll("input")]);
  const invalidRange = create(html`<p class="notice error" role="alert">Choose a valid date range ending today or earlier.</p>`);
  const summary = create(html`<div class="insights-summary" aria-label="Selected period summary"></div>`);
  const emptyCard = create(html`<div class="insights-card insights-empty"></div>`);
  const jumpLinks = create(html`<nav class="insights-jump-links" aria-label="Insight sections">${SECTIONS.map(([id, label]) => html`<a href="#${id}">${label}<span aria-hidden="true">↗</span></a>`)}</nav>`);
  const methodNote = create(html`<p class="insights-method-note">These are associations, not explanations. “Not recorded” means an activity wasn’t selected on a recorded day; missing days are excluded. Small samples can change quickly.</p>`);

  async function load() {
    controller.abort();
    controller = new AbortController();
    const { signal } = controller;
    try {
      const response = await fetch("/api/insights", { cache: "no-store", signal });
      const result = /** @type {InsightsData & { error?: string }} */ (await response.json());
      if (!response.ok) throw new Error(result.error || "Could not load your insights.");
      if (!Array.isArray(result.days) || !Array.isArray(result.moods) || !Array.isArray(result.activities) || !Array.isArray(result.groups)) throw new Error("Could not read your insights. Please try again.");
      if (!signal.aborted) data = result;
    } catch (failure) {
      if (!signal.aborted) error = failure instanceof Error ? failure.message : "Could not load your insights.";
    }
    if (!signal.aborted) app.invalidate();
  }

  /** The selected period and the recorded days in it. */
  function period() {
    const asOf = logicalDateFromDate();
    /** @type {InsightsDay[]} */
    const history = historyMemo([data, asOf], () => data?.days.filter((day) => day.logicalDate <= asOf).sort((a, b) => a.logicalDate.localeCompare(b.logicalDate)) ?? []);
    const range = preset === "custom"
      ? { startDate: customStart, endDate: customEnd }
      : insightsDateRange(preset, asOf, history[0]?.logicalDate ?? asOf);
    const validRange = isLogicalDate(range.startDate) && isLogicalDate(range.endDate) && range.startDate <= range.endDate && range.endDate <= asOf;
    /** @type {InsightsDay[]} */
    const days = daysMemo([history, range.startDate, range.endDate, validRange], () => validRange ? history.filter((day) => day.logicalDate >= range.startDate && day.logicalDate <= range.endDate) : []);
    return { asOf, history, range, validRange, days };
  }

  function update() {
    const { asOf, history, range, validRange, days } = period();
    /** @type {string[]} */
    const years = yearsMemo([history], () => [...new Set(history.map((day) => day.logicalDate.slice(0, 4)))].sort().reverse());
    const calendarDays = validRange ? daysInInsightsRange(range.startDate, range.endDate) : 0;
    /** @type {number} */
    const activityCount = activityCountMemo([days], () => new Set(days.flatMap((day) => day.activityIds)).size);
    const showAnalysis = Boolean(data) && validRange && days.length > 0;

    // The two analysis blocks keep their selections while they show, and start again after they go.
    if (showAnalysis && !relationships && data) {
      relationships = createRelationshipInsights({ props: { days, moods: data.moods, activities: data.activities, groups: data.groups }, invalidate: app.invalidate });
      rhythms = createRhythmInsights({ invalidate: app.invalidate });
    } else if (!showAnalysis && relationships) {
      relationships.node.remove();
      rhythms?.node.remove();
      relationships = null;
      rhythms = null;
    }

    set(/** @type {Element} */ (errorCard.children[1]), { text: error });
    placeAll({
      parent: page,
      nodes: [
        [loadingCard, !data && !error],
        [errorCard, Boolean(error)],
        [toolbar, Boolean(data)],
        [invalidRange, Boolean(data) && !validRange],
        [summary, Boolean(data) && validRange],
        [emptyCard, Boolean(data) && validRange && !days.length],
        [jumpLinks, showAnalysis],
        [methodNote, showAnalysis],
        ...(relationships && rhythms ? /** @type {Array<[Node, boolean]>} */ ([[relationships.node, true], [rhythms.node, true]]) : []),
      ],
    });
    if (!data) return;

    set(periodSelect, {
      html: html`<option value="all">All time</option><option value="90d">Last 90 days</option><option value="1y">Last 365 days</option>${years.map((year) => html`<option value="${year}">${year}</option>`)}<option value="custom">Custom dates</option>`,
      value: preset,
    });
    placeAll({ parent: toolbar, nodes: [[customRange, preset === "custom"], [toolbarNote, true]] });
    set(fromInput, { value: customStart, max: customEnd || asOf });
    set(toInput, { value: customEnd, min: customStart || null, max: asOf });
    if (!validRange) return;

    set(summary, {
      html: html`
        <div><strong>${days.length.toLocaleString()}</strong><span>recorded days</span></div>
        <div><strong>${calendarDays ? Math.round(days.length / calendarDays * 100) : 0}<small>%</small></strong><span>of days recorded</span></div>
        <div><strong>${activityCount}</strong><span>activities recorded</span></div>`,
    });
    if (!days.length) {
      set(emptyCard, { html: html`${icon("insights")}<h2>${history.length ? "No entries in this period" : "Your patterns start with a day"}</h2><p>${history.length ? "Try a wider date range to explore your recorded history." : "Save moods and activities in your journal. As your history grows, your patterns will appear here."}</p>` });
      return;
    }
    relationships?.update({ days, moods: data.moods, activities: data.activities, groups: data.groups });
    rhythms?.update({ days, moods: data.moods, activities: data.activities, groups: data.groups, startDate: range.startDate, endDate: range.endDate, asOf, weekEndsOn: state.data?.settings.weekEndsOn ?? 0 });
  }

  void load();

  return {
    nodes: [page],
    update,
    destroy: () => controller.abort(),
    get handlers() {
      return {
        click: {
          "insights-retry": () => {
            error = "";
            app.invalidate();
            void load();
          },
          ...relationships?.handlers.click,
        },
        input: {
          "insights-from": (/** @type {HTMLInputElement} */ input) => {
            customStart = input.value;
            app.invalidate();
          },
          "insights-to": (/** @type {HTMLInputElement} */ input) => {
            customEnd = input.value;
            app.invalidate();
          },
        },
        change: {
          "insights-period": (/** @type {HTMLSelectElement} */ select) => {
            if (select.value === "custom") {
              const { range } = period();
              customStart = range.startDate;
              customEnd = range.endDate;
            }
            preset = select.value;
            app.invalidate();
          },
          ...relationships?.handlers.change,
          ...rhythms?.handlers.change,
        },
      };
    },
  };
}
