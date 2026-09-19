"use client";

import { useEffect, useMemo, useState } from "react";
import { isLogicalDate, logicalDateFromDate } from "../../lib/daylio";
import { daysInInsightsRange, insightsDateRange, type InsightsData } from "../../lib/insights";
import { RelationshipInsights } from "./insights-relationships";
import { RhythmInsights } from "./insights-rhythms";
import { Icon } from "./icon";
import "./insights.css";

const sections = [
  ["insights-activities", "Activities"],
  ["insights-next-day", "Next day"],
  ["insights-combinations", "Combinations"],
  ["insights-rhythms", "Rhythms"],
  ["insights-best-weeks", "Best weeks"],
];

export function InsightsView() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [error, setError] = useState("");
  const [request, setRequest] = useState(0);
  const [preset, setPreset] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const asOf = logicalDateFromDate();

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/insights", { cache: "no-store", signal: controller.signal });
        const result = await response.json() as InsightsData & { error?: string };
        if (!response.ok) throw new Error(result.error || "Could not load your insights.");
        if (!Array.isArray(result.days) || !Array.isArray(result.moods) || !Array.isArray(result.activities) || !Array.isArray(result.groups)) throw new Error("Could not read your insights. Please try again.");
        if (!controller.signal.aborted) setData(result);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not load your insights.");
      }
    }
    void load();
    return () => controller.abort();
  }, [request]);

  const history = useMemo(() => data?.days.filter((day) => day.logicalDate <= asOf).sort((a, b) => a.logicalDate.localeCompare(b.logicalDate)) ?? [], [data, asOf]);
  const years = useMemo(() => [...new Set(history.map((day) => day.logicalDate.slice(0, 4)))].sort().reverse(), [history]);
  const range = preset === "custom"
    ? { startDate: customStart, endDate: customEnd }
    : insightsDateRange(preset, asOf, history[0]?.logicalDate ?? asOf);
  const validRange = isLogicalDate(range.startDate) && isLogicalDate(range.endDate) && range.startDate <= range.endDate && range.endDate <= asOf;
  const days = useMemo(() => validRange ? history.filter((day) => day.logicalDate >= range.startDate && day.logicalDate <= range.endDate) : [], [history, range.startDate, range.endDate, validRange]);
  const calendarDays = validRange ? daysInInsightsRange(range.startDate, range.endDate) : 0;
  const activityCount = useMemo(() => new Set(days.flatMap((day) => day.activityIds)).size, [days]);

  return (
    <div className="page-section insights-page">
      <div className="page-intro insights-intro">
        <p className="eyebrow">A little perspective</p>
        <h1>Your everyday, over time.</h1>
        <p className="muted">Explore the activities, rhythms, and combinations that accompany your moods.</p>
      </div>

      {!data && !error && <div className="insights-card insights-loading" role="status" aria-busy="true"><Icon name="insights" /><p>Looking through your journal…</p><span className="insights-help">Loading your full recorded history.</span></div>}
      {error && <div className="insights-card" role="alert"><h2>Insights couldn’t load</h2><p className="insights-help">{error}</p><button className="secondary-button" onClick={() => { setError(""); setRequest((value) => value + 1); }}>Try again</button></div>}

      {data && <>
        <div className="insights-toolbar">
          <label className="insights-field"><span>Explore a period</span><select className="insights-select" value={preset} onChange={(event) => {
            const next = event.target.value;
            if (next === "custom") { setCustomStart(range.startDate); setCustomEnd(range.endDate); }
            setPreset(next);
          }}>
            <option value="all">All time</option><option value="90d">Last 90 days</option><option value="1y">Last 365 days</option>
            {years.map((year) => <option key={year} value={year}>{year}</option>)}
            <option value="custom">Custom dates</option>
          </select></label>
          {preset === "custom" && <div className="insights-custom-range">
            <label className="insights-field"><span>From</span><input className="insights-select" type="date" value={customStart} max={customEnd || asOf} onChange={(event) => setCustomStart(event.target.value)} /></label>
            <label className="insights-field"><span>To</span><input className="insights-select" type="date" value={customEnd} min={customStart || undefined} max={asOf} onChange={(event) => setCustomEnd(event.target.value)} /></label>
          </div>}
          <p className="insights-toolbar-note"><Icon name="auto_graph" /><span>Patterns in your records.<br />A starting point for curiosity.</span></p>
        </div>
        {!validRange ? <p className="notice error" role="alert">Choose a valid date range ending today or earlier.</p> : <>
          <div className="insights-summary" aria-label="Selected period summary">
            <div><strong>{days.length.toLocaleString()}</strong><span>recorded days</span></div>
            <div><strong>{calendarDays ? Math.round(days.length / calendarDays * 100) : 0}<small>%</small></strong><span>of days recorded</span></div>
            <div><strong>{activityCount}</strong><span>activities recorded</span></div>
          </div>
          {!days.length ? <div className="insights-card insights-empty"><Icon name="insights" /><h2>{history.length ? "No entries in this period" : "Your patterns start with a day"}</h2><p>{history.length ? "Try a wider date range to explore your recorded history." : "Save moods and activities in your journal. As your history grows, your patterns will appear here."}</p></div> : <>
            <nav className="insights-jump-links" aria-label="Insight sections">{sections.map(([id, label]) => <a key={id} href={`#${id}`}>{label}<span aria-hidden="true">↗</span></a>)}</nav>
            <p className="insights-method-note">These are associations, not explanations. “Not recorded” means an activity wasn’t selected on a recorded day; missing days are excluded. Small samples can change quickly.</p>
            <RelationshipInsights days={days} moods={data.moods} activities={data.activities} groups={data.groups} />
            <RhythmInsights days={days} moods={data.moods} activities={data.activities} groups={data.groups} startDate={range.startDate} endDate={range.endDate} asOf={asOf} />
          </>}
        </>}
      </>}
    </div>
  );
}
