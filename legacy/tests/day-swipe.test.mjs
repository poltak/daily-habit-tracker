import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const { DAY_SWIPE_MIN_DISTANCE, dayOffsetFromSwipe } = await import("../lib/day-swipe.ts");

test("a horizontal swipe moves one day: left goes forward, right goes back", () => {
  assert.equal(dayOffsetFromSwipe({ deltaX: -DAY_SWIPE_MIN_DISTANCE, deltaY: 0 }), 1);
  assert.equal(dayOffsetFromSwipe({ deltaX: DAY_SWIPE_MIN_DISTANCE, deltaY: 0 }), -1);
  assert.equal(dayOffsetFromSwipe({ deltaX: -200, deltaY: 30 }), 1);
  assert.equal(dayOffsetFromSwipe({ deltaX: 200, deltaY: -30 }), -1);
});

test("short drags and mostly vertical drags leave the day unchanged", () => {
  assert.equal(dayOffsetFromSwipe({ deltaX: 0, deltaY: 0 }), 0);
  assert.equal(dayOffsetFromSwipe({ deltaX: DAY_SWIPE_MIN_DISTANCE - 1, deltaY: 0 }), 0);
  assert.equal(dayOffsetFromSwipe({ deltaX: -(DAY_SWIPE_MIN_DISTANCE - 1), deltaY: 0 }), 0);
  assert.equal(dayOffsetFromSwipe({ deltaX: 60, deltaY: 60 }), 0);
  assert.equal(dayOffsetFromSwipe({ deltaX: -60, deltaY: 300 }), 0);
});

test("the top date switcher handles touch swipes and keeps vertical scrolling", async () => {
  const pageSource = await readFile(new URL("../app/journal.tsx", import.meta.url), "utf8");
  const stylesSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const switcher = pageSource.slice(pageSource.indexOf('className="topbar-date-switcher"'), pageSource.indexOf('aria-label="Next day"'));
  assert.match(switcher, /onTouchStart=/);
  assert.match(switcher, /onTouchEnd=/);
  assert.match(switcher, /onTouchCancel=/);
  assert.match(pageSource, /dayOffsetFromSwipe\(\{ deltaX: .*, deltaY: .* \}\)/);
  assert.match(stylesSource, /\.topbar-date-switcher\s*\{[^}]*touch-action:\s*pan-y;/);
});
