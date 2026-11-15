import type { Unsubscribe } from "@app/common/features/core/events/event-emitter";
import type { LoggerServiceInterface } from "@app/common/features/core/services/types";
import type { HistoryServiceInterface } from "./types.js";

interface Guard {
  onRefused: () => void;
  /** The `idx` that React Router stores in `history.state` for the page that the guard holds. */
  index: number | null;
}

function indexOf(state: unknown): number | null {
  if (typeof state === "object" && state !== null && "idx" in state) {
    return typeof state.idx === "number" ? state.idx : null;
  }
  return null;
}

export class BrowserHistoryService implements HistoryServiceInterface {
  private guarded: Guard | null = null;
  private restoring = false;

  /**
   * The listener is added here, and in the capture phase. `createApp` runs
   * before React Router adds its own listener, so this one runs first and
   * `stopImmediatePropagation` keeps the router from changing the page. The
   * page must stay mounted: a page that unmounts cleans up its Logic, which
   * cancels the request that the guard waits for.
   */
  constructor(private readonly deps: { logger: LoggerServiceInterface }) {
    window.addEventListener("popstate", this.handlePopState, { capture: true });
  }

  guard(onRefused: () => void): Unsubscribe {
    const guard: Guard = { onRefused, index: indexOf(window.history.state) };
    this.guarded = guard;
    this.restoring = false;
    return () => {
      if (this.guarded === guard) {
        this.guarded = null;
        this.restoring = false;
      }
    };
  }

  private readonly handlePopState = (event: PopStateEvent): void => {
    const { guarded } = this;
    if (!guarded) {
      return;
    }
    event.stopImmediatePropagation();
    if (this.restoring) {
      this.restoring = false;
      return;
    }
    const target = indexOf(event.state);
    let delta = 1;
    if (target === null || guarded.index === null) {
      this.deps.logger.warn(
        "The history entry has no index, so the move is undone by one step",
      );
    } else {
      delta = guarded.index - target;
    }
    if (delta !== 0) {
      this.restoring = true;
      window.history.go(delta);
    }
    guarded.onRefused();
  };
}
