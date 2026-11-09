import { ACTIVITY_ICON_CHOICES, UI_ICONS } from "../lib/icons.js";
import { create, delegate, html, place, set, syncChildren } from "./dom.js";
import { icon } from "./ui.js";

/** @param {string} name */
function iconLabel(name) {
  return name.replaceAll("_", " ");
}

const ICON_PAGE_SIZE = 120;
const ICON_CATEGORIES = ["All", ...new Set(ACTIVITY_ICON_CHOICES.map((choice) => choice.category))];

/**
 * The icon dialog. Put `node` in the page, call `open` one time, then call `update` when a prop changes.
 * @param {{ onClose: () => void; onSelect: (icon: string) => void }} input
 */
export function createIconPicker({ onClose, onSelect }) {
  let query = "";
  let category = "All";
  let visibleLimit = ICON_PAGE_SIZE;
  let props = { activityName: "", itemType: "Activity", currentIcon: "", isSaving: false };

  const node = create(html`
    <div class="icon-picker-backdrop">
      <section class="icon-picker" role="dialog" aria-modal="true" aria-labelledby="icon-picker-title">
        <div class="icon-picker-header">
          <div><p class="eyebrow"></p><h2 id="icon-picker-title">Choose an icon</h2><p class="muted"></p></div>
          <button class="icon-button" aria-label="Close icon picker" data-action="picker-close">${icon(UI_ICONS.close)}</button>
        </div>
        <label class="search-field icon-picker-search">${icon(UI_ICONS.search)}<input placeholder="Search icons by name or category" aria-label="Search icons"></label>
        <div class="icon-picker-categories" role="toolbar" aria-label="Icon categories">${ICON_CATEGORIES.map((item) => html`<button data-action="picker-category" data-category="${item}">${item}</button>`)}</div>
        <p class="icon-picker-count"></p>
        <div class="icon-picker-grid" aria-label="Available icons"></div>
      </section>
    </div>`);
  const dialog = /** @type {HTMLElement} */ (node.querySelector(".icon-picker"));
  const eyebrow = /** @type {HTMLElement} */ (node.querySelector(".eyebrow"));
  const subject = /** @type {HTMLElement} */ (node.querySelector(".muted"));
  const closeButton = /** @type {HTMLButtonElement} */ (node.querySelector(".icon-button"));
  const search = /** @type {HTMLInputElement} */ (node.querySelector("input"));
  const categoryButtons = /** @type {HTMLButtonElement[]} */ ([...node.querySelectorAll(".icon-picker-categories button")]);
  const count = /** @type {HTMLElement} */ (node.querySelector(".icon-picker-count"));
  const grid = /** @type {HTMLElement} */ (node.querySelector(".icon-picker-grid"));
  const empty = create(html`<div class="empty-inline">No icons match that search.</div>`);
  const more = create(html`<button class="ghost-button icon-picker-more" data-action="picker-more">Show more icons</button>`);

  function render() {
    const { activityName, itemType, currentIcon, isSaving } = props;
    const normalizedQuery = query.trim().toLowerCase();
    const choices = ACTIVITY_ICON_CHOICES.filter(
      (choice) =>
        (category === "All" || choice.category === category) &&
        (!normalizedQuery || `${choice.name} ${iconLabel(choice.name)} ${choice.category}`.toLowerCase().includes(normalizedQuery)),
    );
    set(eyebrow, { text: `${itemType} icon` });
    set(subject, { text: `For ${activityName}` });
    set(closeButton, { disabled: isSaving });
    for (const button of categoryButtons) {
      const selected = button.dataset.category === category;
      set(button, { class: selected ? "selected" : "", "aria-pressed": selected, disabled: isSaving });
    }
    set(count, { role: isSaving ? "status" : null, text: isSaving ? "Saving icon…" : `Showing ${Math.min(visibleLimit, choices.length)} of ${choices.length} icons` });
    const hasMore = choices.length > visibleLimit;
    place({ node: more, present: hasMore, parent: dialog });
    place({ node: grid, present: choices.length > 0, parent: dialog, before: hasMore ? more : null });
    place({ node: empty, present: choices.length === 0, parent: dialog, before: hasMore ? more : null });
    set(more, { disabled: isSaving });
    syncChildren({
      parent: grid,
      items: choices.slice(0, visibleLimit),
      key: (choice) => choice.name,
      create: (choice) => create(html`<button data-action="picker-select" data-icon="${choice.name}">${icon(choice.name)}<span>${iconLabel(choice.name)}</span></button>`),
      update: (button, choice) => set(button, {
        class: `icon-choice ${currentIcon === choice.name ? "selected" : ""}`,
        "aria-label": isSaving ? "Saving icon…" : `Use ${iconLabel(choice.name)} icon`,
        "aria-pressed": currentIcon === choice.name,
        disabled: isSaving,
      }),
    });
  }

  search.addEventListener("input", () => {
    query = search.value;
    visibleLimit = ICON_PAGE_SIZE;
    render();
  });
  node.addEventListener("mousedown", (event) => {
    if (event.target === node) onClose();
  });
  delegate({
    root: node,
    type: "click",
    handlers: {
      "picker-close": () => onClose(),
      "picker-category": (button) => {
        category = button.dataset.category;
        visibleLimit = ICON_PAGE_SIZE;
        render();
      },
      "picker-more": () => {
        visibleLimit += ICON_PAGE_SIZE;
        render();
      },
      "picker-select": (button) => onSelect(button.dataset.icon),
    },
  });

  /** @param {KeyboardEvent} event */
  function closeOnEscape(event) {
    if (event.key === "Escape") onClose();
    if (event.key !== "Tab") return;
    const controls = /** @type {NodeListOf<HTMLElement>} */ (dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), [href], [tabindex="0"]'));
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /** @type {HTMLElement | null} */
  let previousFocus = null;
  let previousOverflow = "";

  return {
    node,
    /** @param {{ activityName: string; itemType?: "Activity" | "Goal"; currentIcon: string; isSaving: boolean }} next */
    update({ activityName, itemType = "Activity", currentIcon, isSaving }) {
      props = { activityName, itemType, currentIcon, isSaving };
      render();
    },
    /** Call after `node` is in the page. */
    open() {
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      search.focus();
      window.addEventListener("keydown", closeOnEscape);
    },
    close() {
      window.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
      node.remove();
      previousFocus?.focus({ preventScroll: true });
    },
  };
}

/**
 * Opens, updates and closes one icon picker to match `props`. `null` means that no picker shows.
 * @param {{ parent: () => Node; onClose: () => void; onSelect: (icon: string) => void }} input
 */
export function createIconPickerSlot({ parent, onClose, onSelect }) {
  /** @type {ReturnType<typeof createIconPicker> | null} */
  let picker = null;
  return {
    /** @param {{ activityName: string; itemType?: "Activity" | "Goal"; currentIcon: string; isSaving: boolean } | null} props */
    update(props) {
      if (!props) {
        picker?.close();
        picker = null;
        return;
      }
      if (picker) {
        picker.update(props);
        return;
      }
      picker = createIconPicker({ onClose, onSelect });
      picker.update(props);
      parent().appendChild(picker.node);
      picker.open();
    },
  };
}
