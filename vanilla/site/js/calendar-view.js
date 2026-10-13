import { attrs, create, html, place, set } from "./dom.js";
import { actionIcon, friendlyDate, monthGrid, moodFace } from "./ui.js";

/** @import { App } from "./app.js" */

/** A month of entry days. Each day opens its check-in. @param {App} app */
export function createCalendarView(app) {
  const { state } = app;
  const page = create(html`
    <section class="page-section calendar-page">
      <div class="page-intro">
        <p class="eyebrow">Your history</p>
        <h1>Calendar</h1>
        <p class="muted">Each entry day shows its mood. Select today or an earlier day to open or add its check-in.</p>
      </div>
      <section class="calendar-card">
        <div class="calendar-heading">
          <button class="icon-button" data-action="month" data-shift="-1"></button>
          <h2></h2>
          <button class="icon-button" data-action="month" data-shift="1"></button>
        </div>
        <div class="calendar-weekdays"></div>
        <div class="calendar-grid"></div>
        <div class="calendar-legend">
          <span><i class="legend-dot filled"></i> Entry with mood</span>
          <span><i class="legend-dot"></i> Empty</span>
        </div>
      </section>
    </section>`);
  const card = /** @type {HTMLElement} */ (page.querySelector(".calendar-card"));
  const [previous, label, next] = /** @type {HTMLElement[]} */ ([...(/** @type {HTMLElement} */ (page.querySelector(".calendar-heading"))).children]);
  const weekdayRow = /** @type {HTMLElement} */ (page.querySelector(".calendar-weekdays"));
  const grid = /** @type {HTMLElement} */ (page.querySelector(".calendar-grid"));
  const legend = /** @type {HTMLElement} */ (page.querySelector(".calendar-legend"));
  const loading = create(html`<p class="calendar-loading" role="status">Checking this month…</p>`);

  function resolvedMonth() {
    const data = /** @type {NonNullable<typeof state.data>} */ (state.data);
    return /^\d{4}-\d{2}$/.test(state.calendarMonth) ? state.calendarMonth : data.today.slice(0, 7);
  }

  function update() {
    const data = /** @type {NonNullable<typeof state.data>} */ (state.data);
    const isLoading = state.isLoadingCalendar;
    const month = resolvedMonth();
    const moods = new Map(data.moods.map((mood) => [mood.id, mood]));
    const entriesByDate = new Map(state.calendarDays.map((day) => [day.logicalDate, day]));
    const { cells, label: monthLabel, weekdays } = monthGrid({ month, weekEndsOn: data.settings.weekEndsOn });

    set(previous, { "aria-label": isLoading ? "Loading month" : "Previous month", "aria-busy": isLoading, disabled: isLoading, html: actionIcon("chevron_left", isLoading) });
    set(label, { text: monthLabel });
    set(next, { "aria-label": isLoading ? "Loading month" : "Next month", "aria-busy": isLoading, disabled: isLoading || month >= data.today.slice(0, 7), html: actionIcon("chevron_right", isLoading) });
    set(weekdayRow, { html: weekdays.map((day) => html`<span>${day}</span>`) });
    set(grid, {
      html: cells.map((date) => {
        if (!date) return html`<span class="calendar-blank"></span>`;
        const entry = entriesByDate.get(date);
        const mood = entry ? moods.get(entry.moodId) : undefined;
        const notStarted = date > data.today;
        return html`<button class="calendar-day ${entry ? "filled" : ""} ${date === data.today ? "today" : ""} ${notStarted ? "not-started" : ""}" data-action="open-date" data-date="${date}"${attrs({
          style: mood ? `--calendar-mood-color:${mood.color}` : null,
          disabled: notStarted,
          "aria-label": `${friendlyDate(date)}${mood ? `, ${mood.name} mood, entry exists` : entry ? ", entry exists" : notStarted ? ", not started" : ", empty"}`,
        })}><span>${Number(date.slice(-2))}</span>${mood ? moodFace({ score: mood.score, color: mood.color, svgAttributes: { class: "calendar-mood-emoji" } }) : ""}</button>`;
      }),
    });
    place({ node: loading, present: isLoading, parent: card, before: legend });
  }

  return {
    nodes: [page],
    update,
    handlers: {
      click: {
        month: (/** @type {HTMLElement} */ button) => {
          const data = /** @type {NonNullable<typeof state.data>} */ (state.data);
          app.set({ calendarMonth: monthGrid({ month: resolvedMonth(), weekEndsOn: data.settings.weekEndsOn }).shifted(Number(button.dataset.shift)) });
        },
        "open-date": (/** @type {HTMLElement} */ button) => {
          app.changeView("log");
          void app.chooseDate(button.dataset.date ?? "");
        },
      },
    },
  };
}
