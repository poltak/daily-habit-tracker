import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../lib/icons.ts", import.meta.url), "utf8");
const catalogLiteral = source.match(/const COMPLETE_MATERIAL_SYMBOL_NAMES = "([^"]+)"/s)?.[1];
const completeCatalog = catalogLiteral?.split(" ") ?? [];

test("activity icon picker ships the complete Material Symbols catalog", () => {
  assert.ok(completeCatalog.length >= 3800);
  assert.equal(new Set(completeCatalog).size, completeCatalog.length);
  assert.ok(completeCatalog.includes("fitness_center"));
  assert.ok(completeCatalog.includes("menu_book"));
  assert.ok(completeCatalog.includes("calendar_month"));
  assert.match(source, /export const ACTIVITY_ICON_CHOICES/);
  assert.match(source, /category: "All icons"/);
});
