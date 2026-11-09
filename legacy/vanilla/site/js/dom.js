// The small set of DOM helpers that the views share. There is no virtual DOM:
// each view makes its elements one time and then changes them in place.

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Markup that is safe to put in the page. Only `html` and `raw` make it. */
class Markup {
  /** @param {string} text */
  constructor(text) {
    this.text = text;
  }
  toString() {
    return this.text;
  }
}

/** @param {unknown} value */
function markupFor(value) {
  if (value === null || value === undefined || value === false || value === true) return "";
  if (value instanceof Markup) return value.text;
  if (Array.isArray(value)) return value.map(markupFor).join("");
  return String(value).replace(/[&<>"']/g, (character) => ESCAPES[/** @type {keyof typeof ESCAPES} */ (character)]);
}

/** @type {WeakMap<TemplateStringsArray, string[]>} */
const TEMPLATE_PARTS = new WeakMap();

// A template can put each tag on its own line. As in JSX, a line break between two tags adds no text to the page.
/** @param {TemplateStringsArray} strings */
function templateParts(strings) {
  let parts = TEMPLATE_PARTS.get(strings);
  if (!parts) {
    parts = strings.map((part) => part.replace(/>\s*\n\s*</g, "><").replace(/^\s*\n\s*/, "").replace(/\s*\n\s*$/, ""));
    TEMPLATE_PARTS.set(strings, parts);
  }
  return parts;
}

/**
 * A template tag for markup. It escapes each value, so text from the journal cannot become markup.
 * Markup from another `html` call, and arrays of it, go in as they are. `null`, `undefined` and booleans give nothing.
 * @param {TemplateStringsArray} strings
 * @param {...unknown} values
 */
export function html(strings, ...values) {
  const parts = templateParts(strings);
  let text = parts[0];
  for (let index = 0; index < values.length; index += 1) text += markupFor(values[index]) + parts[index + 1];
  return new Markup(text);
}

/** Marks text as markup without escaping it. @param {string} text */
export function raw(text) {
  return new Markup(text);
}

/**
 * The attributes of a tag. `false`, `null` and `undefined` leave an attribute out, and `true` gives an empty one.
 * An `aria-` attribute is different: it always shows its boolean as text, because `aria-busy="false"` has a meaning.
 * @param {Record<string, unknown>} attributes
 */
export function attrs(attributes) {
  let text = "";
  for (const [name, value] of Object.entries(attributes)) {
    const resolved = attributeValue(name, value);
    if (resolved !== null) text += ` ${name}="${markupFor(resolved)}"`;
  }
  return new Markup(text);
}

/** @param {string} name @param {unknown} value @returns {string | null} */
function attributeValue(name, value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return name.startsWith("aria-") ? String(value) : value ? "" : null;
  return String(value);
}

/**
 * Makes the one element that the markup describes.
 * @param {Markup} markup
 * @returns {HTMLElement}
 */
export function create(markup) {
  const template = document.createElement("template");
  template.innerHTML = markup.text;
  return /** @type {HTMLElement} */ (template.content.firstElementChild);
}

const LAST_MARKUP = new WeakMap();

/**
 * Brings an element in line with `props`, and writes to the DOM only where a value is different.
 * `class`, `text`, `html` and `style` are special. `value`, `checked`, `disabled` and `open` are set as properties.
 * Each other name is an attribute, with the rules of `attrs`.
 * @param {Element} element
 * @param {Record<string, unknown>} props
 */
export function set(element, props) {
  const target = /** @type {any} */ (element);
  for (const [name, value] of Object.entries(props)) {
    if (name === "class") {
      if (value === null || value === undefined) element.removeAttribute("class");
      else if (element.getAttribute("class") !== value) element.setAttribute("class", String(value));
    } else if (name === "text") {
      const text = String(value);
      if (element.textContent !== text) element.textContent = text;
    } else if (name === "html") {
      const text = markupFor(value);
      if (LAST_MARKUP.get(element) !== text) {
        element.innerHTML = text;
        LAST_MARKUP.set(element, text);
      }
    } else if (name === "style") {
      // Custom properties only: `{ "--day-color": "#abc" }`. A null value removes the property.
      for (const [property, propertyValue] of Object.entries(/** @type {Record<string, string | null | undefined>} */ (value))) {
        if (propertyValue === null || propertyValue === undefined) target.style.removeProperty(property);
        else if (target.style.getPropertyValue(property) !== propertyValue) target.style.setProperty(property, propertyValue);
      }
    } else if (name === "value" && element instanceof HTMLSelectElement) {
      selectOption(element, String(value));
    } else if (name === "value" || name === "checked" || name === "disabled" || name === "open") {
      if (target[name] !== value) target[name] = value;
    } else {
      const resolved = attributeValue(name, value);
      if (resolved === null) {
        if (element.hasAttribute(name)) element.removeAttribute(name);
      } else if (element.getAttribute(name) !== resolved) element.setAttribute(name, resolved);
    }
  }
}

/** Selects the option that has `value`. As React does, it selects the first option when no option has the value. */
/** @param {HTMLSelectElement} select @param {string} value */
function selectOption(select, value) {
  const index = [...select.options].findIndex((option) => option.value === value);
  if (select.selectedIndex !== Math.max(index, 0)) select.selectedIndex = Math.max(index, 0);
}

/**
 * Puts `node` in `parent` before `before` when `present` is true, and takes it out when not.
 * A node that is already in its place is not moved, so its animation and focus stay.
 * @param {{ node: Node; present: boolean; parent: Node; before?: Node | null }} input
 */
export function place({ node, present, parent, before = null }) {
  if (!present) {
    if (node.parentNode === parent) parent.removeChild(node);
  } else if (node.parentNode !== parent || node.nextSibling !== before) {
    parent.insertBefore(node, before);
  }
}

/**
 * Puts the present nodes at the end of `parent` in the given order, and takes the others out.
 * @param {{ parent: Node; nodes: Array<[node: Node, present: boolean]> }} input
 */
export function placeAll({ parent, nodes }) {
  /** @type {Node | null} */
  let before = null;
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const [node, present] = nodes[index];
    place({ node, present, parent, before });
    if (present) before = node;
  }
}

const KEYED_CHILDREN = new WeakMap();

/**
 * Makes the element children of `parent` match `items`, one child for each key.
 * A child whose key stays is kept and updated in place, so it keeps its focus, its animation and its open state.
 * @template T
 * @param {{ parent: Element; items: readonly T[]; key: (item: T) => string; create: (item: T) => Element; update?: (element: any, item: T, index: number) => void }} input
 */
export function syncChildren({ parent, items, key, create: createChild, update }) {
  /** @type {Map<string, Element>} */
  const previous = KEYED_CHILDREN.get(parent) ?? new Map();
  /** @type {Map<string, Element>} */
  const next = new Map();
  const keys = items.map(key);
  const kept = new Set(keys);
  // Take the stale children out first. Then a child that stays is not moved to get past them.
  for (const [childKey, child] of previous) {
    if (!kept.has(childKey)) child.remove();
  }
  let expected = parent.firstElementChild;
  items.forEach((item, index) => {
    const childKey = keys[index];
    if (next.has(childKey)) return;
    const child = previous.get(childKey) ?? createChild(item);
    if (child === expected) expected = expected.nextElementSibling;
    else parent.insertBefore(child, expected);
    next.set(childKey, child);
    update?.(child, item, index);
  });
  KEYED_CHILDREN.set(parent, next);
}

/**
 * Sends an event to the handler that the nearest `data-action` element names. A disabled control gets nothing.
 * @param {{ root: EventTarget; type: string; handlers: Record<string, (element: any, event: any) => void> }} input
 */
export function delegate({ root, type, handlers }) {
  root.addEventListener(type, (event) => {
    const element = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (!(element instanceof HTMLElement) || element.matches(":disabled")) return;
    if (root instanceof Node && !root.contains(element)) return;
    handlers[element.dataset.action ?? ""]?.(element, event);
  });
}
