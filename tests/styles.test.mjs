import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../app/journal.tsx", import.meta.url), "utf8");

// Selectors of rules that sit outside any at-rule block.
function topLevelSelectors(css) {
  const selectors = [];
  let depth = 0;
  let current = "";
  for (const char of css.replace(/\/\*[\s\S]*?\*\//g, "")) {
    if (char === "{") {
      if (depth === 0) selectors.push(current.trim().replace(/\s+/g, " "));
      depth += 1;
      current = "";
    } else if (char === "}") {
      depth -= 1;
      current = "";
    } else if (depth === 0 && char === ";") {
      current = "";
    } else {
      current += char;
    }
  }
  return selectors.filter((selector) => selector && !selector.startsWith("@"));
}

test("each base rule is written once, so the last override never has to be hunted for", () => {
  const seen = new Map();
  for (const selector of topLevelSelectors(styles)) seen.set(selector, (seen.get(selector) ?? 0) + 1);
  const repeated = [...seen].filter(([, count]) => count > 1).map(([selector]) => selector);
  assert.deepEqual(repeated, []);
});

test("the page backdrop is drawn in CSS, with no image downloads", async () => {
  assert.doesNotMatch(styles, /url\("\/backgrounds\//);
  assert.match(styles, /\.app-shell::before \{[^}]*radial-gradient\([^}]*var\(--day-color\)/s);
  await assert.rejects(() => readFile(new URL("../public/backgrounds/daymark-light.png", import.meta.url)), /ENOENT/);
  assert.match(pageSource, /"--day-color": dayColor/);
});

test("both themes define every token the other defines", () => {
  const tokens = (block) => new Set([...block.matchAll(/(--[a-z0-9-]+):/g)].map((match) => match[1]));
  const light = tokens(styles.match(/:root \{[\s\S]*?\n\}/)[0]);
  const dark = tokens(styles.match(/:root\[data-theme="dark"\] \{[\s\S]*?\n\}/)[0]);
  // Fonts, radii and the group tints are shared by both themes.
  const shared = [...light].filter((token) => /^--(font|radius|tone)/.test(token));
  assert.deepEqual([...light].filter((token) => !dark.has(token) && !shared.includes(token)), []);
  assert.deepEqual([...dark].filter((token) => !light.has(token)), []);
});

test("moods are drawn faces in the picker and the calendar", () => {
  assert.match(pageSource, /<MoodFace className="mood-emoji" score=\{mood\.score\} color=\{mood\.color\} \/>/);
  assert.match(pageSource, /<MoodFace className="calendar-mood-emoji" score=\{mood\.score\} color=\{mood\.color\} \/>/);
  assert.doesNotMatch(pageSource, /\{mood\.emoji\}/);
});
