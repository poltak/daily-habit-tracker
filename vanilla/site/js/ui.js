// Markup and text that more than one view uses.
import { WEEKDAY_NAMES, weekStartsOn, weekdayOrder } from "../lib/daylio.js";
import { attrs, html } from "./dom.js";

/** @import { ActivityGroup, Entry } from "../lib/daylio.js" */
/** @typedef {{ kind: "success" | "error" | "info"; text: string }} Notice */

// Names the current icon font no longer contains, mapped to the glyph that replaced them.
const RENAMED_ICONS = /** @type {Record<string, string>} */ ({ no_smoking: "smoke_free" });

/** @param {string} name @param {string} [className] */
export function icon(name, className = "") {
  return html`<span class="material-symbols-rounded ${className}" aria-hidden="true">${RENAMED_ICONS[name] ?? name}</span>`;
}

/** A button's icon, or a spinner in its place while the button's action is in progress. @param {string} name @param {boolean} pending */
export function actionIcon(name, pending) {
  return pending ? html`<span class="spinner" aria-hidden="true"></span>` : icon(name);
}

const INK = "#2a2238";

/** @param {number} [y] */
function eyes(y = 27) {
  return html`<circle cx="23" cy="${y}" r="2.9" fill="${INK}" stroke="none"></circle><circle cx="41" cy="${y}" r="2.9" fill="${INK}" stroke="none"></circle>`;
}

// One expression per mood score, from 1 (awful) to 5 (rad).
const EXPRESSIONS = /** @type {Record<number, unknown>} */ ({
  5: html`<path d="M17.5 28.5q4.5-6.5 9 0"></path><path d="M37.5 28.5q4.5-6.5 9 0"></path><path d="M19.5 37.5q12.5 16 25 0z" fill="${INK}"></path>`,
  4: html`${eyes()}<path d="M21 38.5q11 10.5 22 0"></path>`,
  3: html`${eyes()}<path d="M23 42.5h18"></path>`,
  2: html`${eyes(28)}<path d="M22 46q10-9 20 0"></path>`,
  1: html`<path d="M16.5 25l9-4.5"></path><path d="M47.5 25l-9-4.5"></path>${eyes(31)}<path d="M21.5 48q10.5-11.5 21 0"></path>`,
});

/**
 * A drawn face for a mood, so moods look the same on every device. `svgAttributes` go on the `svg` tag.
 * @param {{ score: number; color: string; svgAttributes?: Record<string, unknown> }} input
 */
export function moodFace({ score, color, svgAttributes = {} }) {
  const level = Math.min(5, Math.max(1, Math.round(score)));
  return html`<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"${attrs(svgAttributes)}><circle cx="32" cy="32" r="32" fill="${color}"></circle><ellipse cx="24" cy="19" rx="15" ry="11" fill="#fff" opacity=".2"></ellipse><g fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" opacity=".88">${EXPRESSIONS[level]}</g></svg>`;
}

/** The text of a notice with its mark. @param {Notice} message */
export function noticeText(message) {
  return `${message.kind === "success" ? "✓" : message.kind === "info" ? "↻" : "!"} ${message.text}`;
}

/** @param {string} value @param {Intl.DateTimeFormatOptions} options */
function formatLogicalDate(value, options) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en", options).format(new Date(year, month - 1, day));
}

/** @param {string} value */
export function friendlyDate(value) {
  return formatLogicalDate(value, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

/** @param {string} value */
export function longDate(value) {
  return formatLogicalDate(value, { month: "long", day: "numeric" });
}

/** @param {string} value */
export function shortDate(value) {
  return formatLogicalDate(value, { month: "short", day: "numeric" });
}

/** @param {Entry[]} entries @param {string} date */
export function getEntryForDate(entries, date) {
  return entries.find((entry) => entry.logicalDate === date && !entry.deletedAt);
}

/**
 * The id of the requested group when it is active. If not, the id of the first active group, or "" when there is none.
 * @param {{ groups: readonly ActivityGroup[]; requestedId?: string }} input
 */
export function resolveActiveActivityGroupId({ groups, requestedId }) {
  return groups.find((group) => group.id === requestedId && !group.archived)?.id
    ?? groups.find((group) => !group.archived)?.id
    ?? "";
}

/**
 * Month label and day cells for a calendar grid whose rows start on the first day of the week.
 * @param {{ month: string; weekEndsOn: number }} input
 */
export function monthGrid({ month, weekEndsOn }) {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(year, monthNumber - 1, 1).getDay();
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  /** @type {Array<string | null>} */
  const cells = [
    ...Array((firstDay - weekStartsOn(weekEndsOn) + 7) % 7).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`),
  ];
  const label = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(new Date(year, monthNumber - 1, 1));
  const weekdays = weekdayOrder(weekEndsOn).map((weekday) => WEEKDAY_NAMES[weekday].slice(0, 3));
  /** @param {number} amount */
  const shifted = (amount) => {
    const next = new Date(year, monthNumber - 1 + amount, 1);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
  };
  return { cells, label, weekdays, shifted };
}

/**
 * True when both objects have the same value for each key.
 * @param {Record<string, unknown> | null} left
 * @param {Record<string, unknown>} right
 */
export function sameProps(left, right) {
  if (!left) return false;
  const keys = Object.keys(right);
  return keys.length === Object.keys(left).length && keys.every((key) => left[key] === right[key]);
}

/** Remembers the last result of `compute` and reuses it while each value in `inputs` is the same. */
export function memo() {
  /** @type {readonly unknown[] | null} */
  let lastInputs = null;
  /** @type {any} */
  let lastResult;
  /**
   * @template T
   * @param {readonly unknown[]} inputs
   * @param {() => T} compute
   * @returns {T}
   */
  return (inputs, compute) => {
    if (!lastInputs || inputs.length !== lastInputs.length || inputs.some((input, index) => input !== /** @type {readonly unknown[]} */ (lastInputs)[index])) {
      lastResult = compute();
      lastInputs = inputs;
    }
    return lastResult;
  };
}
