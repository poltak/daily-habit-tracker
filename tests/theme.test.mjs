import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

const {
  THEME_BOOTSTRAP_SCRIPT,
  THEME_STORAGE_KEY,
  applyTheme,
  parseThemePreference,
  readStoredThemePreference,
  resolveTheme,
} = await import("../lib/theme.ts");

test("theme preferences accept only the supported values", () => {
  assert.equal(parseThemePreference("system"), "system");
  assert.equal(parseThemePreference("light"), "light");
  assert.equal(parseThemePreference("dark"), "dark");
  assert.equal(parseThemePreference("sepia"), "system");
  assert.equal(parseThemePreference(null), "system");
});

test("stored theme values default to system when missing or unreadable", () => {
  assert.equal(readStoredThemePreference({ getItem: () => null }), "system");
  assert.equal(readStoredThemePreference({ getItem: () => "dark" }), "dark");
  assert.equal(readStoredThemePreference({ getItem: () => { throw new Error("storage unavailable"); } }), "system");
});

test("theme resolution follows the system only for the system preference", () => {
  assert.equal(resolveTheme({ preference: "system", systemTheme: "dark" }), "dark");
  assert.equal(resolveTheme({ preference: "system", systemTheme: "light" }), "light");
  assert.equal(resolveTheme({ preference: "light", systemTheme: "dark" }), "light");
  assert.equal(resolveTheme({ preference: "dark", systemTheme: "light" }), "dark");

  const root = { dataset: {} };
  applyTheme({ root, preference: "dark", systemTheme: "light" });
  assert.equal(root.dataset.theme, "dark");
});

test("before-paint bootstrap applies the saved theme and follows system changes", () => {
  assert.match(THEME_BOOTSTRAP_SCRIPT, new RegExp(THEME_STORAGE_KEY));
  assert.match(THEME_BOOTSTRAP_SCRIPT, /data/);
  assert.match(THEME_BOOTSTRAP_SCRIPT, /prefers-color-scheme/);

  let onChange;
  const media = {
    matches: true,
    addEventListener: (_event, listener) => { onChange = listener; },
  };
  const storage = {
    value: "system",
    getItem: () => storage.value,
  };
  const context = {
    window: { matchMedia: () => media, localStorage: storage },
    document: { documentElement: { dataset: {} } },
  };

  vm.runInNewContext(THEME_BOOTSTRAP_SCRIPT, context);
  assert.equal(context.document.documentElement.dataset.theme, "dark");

  media.matches = false;
  onChange();
  assert.equal(context.document.documentElement.dataset.theme, "light");

  storage.value = "sepia";
  media.matches = true;
  onChange();
  assert.equal(context.document.documentElement.dataset.theme, "dark");

  storage.value = "dark";
  media.matches = false;
  onChange();
  assert.equal(context.document.documentElement.dataset.theme, "dark");
});
