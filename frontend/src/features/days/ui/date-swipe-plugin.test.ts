import { describe, expect, it } from "vitest";
import { setupLogicTest } from "../../core/tests/full-application.js";
import { DateSwipePlugin } from "./date-swipe-plugin.js";

function setupTest() {
  return setupLogicTest({}, () => new DateSwipePlugin());
}

describe("DateSwipePlugin tests", () => {
  it("should pull the label with the finger, and give the day offset at the end", async () => {
    const { logic } = await setupTest();
    expect(logic.state.pull).toEqual(0);

    logic.begin({ x: 100, y: 10 });
    logic.move({ x: 160, canGoForward: true });
    expect(logic.state.pull).toEqual(20);
    logic.move({ x: 40, canGoForward: true });
    expect(logic.state.pull).toEqual(-20);
    const offset = logic.end({ x: 200, y: 12 });

    expect(offset).toEqual(-1);
    expect(logic.state.pull).toEqual(0);
  });

  it("should ask for the next day after a long swipe to the left", async () => {
    const { logic } = await setupTest();

    logic.begin({ x: 200, y: 10 });

    expect(logic.end({ x: 100, y: 10 })).toEqual(1);
  });

  it("should stop the pull at 28 pixels, and not pull toward a day that cannot open", async () => {
    const { logic } = await setupTest();

    logic.begin({ x: 200, y: 10 });
    logic.move({ x: 600, canGoForward: true });
    expect(logic.state.pull).toEqual(28);
    logic.move({ x: -600, canGoForward: true });
    expect(logic.state.pull).toEqual(-28);
    logic.move({ x: -600, canGoForward: false });

    expect(logic.state.pull).toEqual(0);
  });

  it("should ask for no day after a short swipe, a vertical drag, a cancelled touch, or no touch", async () => {
    const { logic } = await setupTest();

    logic.move({ x: 50, canGoForward: true });
    expect(logic.state.pull).toEqual(0);
    expect(logic.end({ x: 50, y: 0 })).toEqual(0);
    logic.begin({ x: 100, y: 10 });
    expect(logic.end({ x: 130, y: 10 })).toEqual(0);
    logic.begin({ x: 100, y: 10 });
    expect(logic.end({ x: 200, y: 120 })).toEqual(0);
    logic.begin({ x: 100, y: 10 });
    expect(logic.end(null)).toEqual(0);
  });
});
