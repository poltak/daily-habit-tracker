import { LogicPlugin } from "@app/common/features/core/logic/logic-plugin";
import { dayOffsetFromSwipe } from "../utils/day-swipe.js";

interface DateSwipeState {
  /** How far the date label follows the finger, in pixels. */
  pull: number;
}

/** The pull of the date label is at most this far, in pixels. */
const MAX_PULL = 28;

/** A swipe on the date row of the log, from the touch to the day it picks. */
export class DateSwipePlugin extends LogicPlugin<
  Record<string, never>,
  DateSwipeState
> {
  private start: { x: number; y: number } | null = null;

  constructor() {
    super({ deps: {}, initialState: { pull: 0 } });
  }

  begin({ x, y }: { x: number; y: number }): void {
    this.start = { x, y };
  }

  /** The label follows the finger a short way, so that the swipe shows. */
  move({ x, canGoForward }: { x: number; canGoForward: boolean }): void {
    if (!this.start) {
      return;
    }
    // The label does not move toward a day that cannot be opened.
    const floor = canGoForward ? -MAX_PULL : 0;
    this.setState({
      pull: Math.max(floor, Math.min(MAX_PULL, (x - this.start.x) / 3)),
    });
  }

  /** The day offset that the swipe asks for: -1, 0 or 1. A cancelled touch asks for 0. */
  end(end: { x: number; y: number } | null): -1 | 0 | 1 {
    const { start } = this;
    this.start = null;
    this.setState({ pull: 0 });
    if (!start || !end) {
      return 0;
    }
    return dayOffsetFromSwipe({
      deltaX: end.x - start.x,
      deltaY: end.y - start.y,
    });
  }
}
