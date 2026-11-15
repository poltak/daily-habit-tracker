import { Logic } from "@app/common/features/core/logic/logic";
import type { Unsubscribe } from "@app/common/features/core/events/event-emitter";
import type { Notice } from "../../days/types.js";
import type { FrontendLogicProps } from "../logic/types.js";
import type { App, LeaveReason } from "../types.js";
import { PageNoticePlugin } from "./page-notice-plugin.js";

type NavigationLockProps = FrontendLogicProps<never, "history"> &
  Pick<App, "navigationLockEvents" | "pageNoticeEvents">;

interface Hold {
  holder: string;
  reason: LeaveReason;
}

interface NavigationLockState {
  /** The holders in the order they started. The newest one decides the notice. */
  holds: Hold[];
  notice: Notice | null;
}

const MESSAGES: Record<LeaveReason, string> = {
  goal: "Wait for the goal update to finish before leaving this goal.",
  setup: "Wait for the setup update to finish before leaving setup.",
  activity: "Wait for the activity update to finish before leaving this view.",
};

/**
 * Holds the navigation while a page has a request in flight. The links, the
 * back buttons of the page and the back button of the browser all stop, and
 * the owner reads why.
 */
export class NavigationLockLogic extends Logic<
  NavigationLockProps,
  NavigationLockState,
  never,
  { pageNotice: PageNoticePlugin }
> {
  private stopGuard: Unsubscribe | null = null;

  constructor(deps: NavigationLockProps) {
    super({
      deps,
      plugins: {
        pageNotice: (pluginDeps) =>
          new PageNoticePlugin({
            pageNoticeEvents: pluginDeps.pageNoticeEvents,
          }),
      },
      initialState: { holds: [], notice: null },
    });
  }

  protected override async onInitialize(): Promise<void> {
    this.listen(this.deps.navigationLockEvents, (event) => {
      if (event.type === "held") {
        this.hold({ holder: event.holder, reason: event.reason });
      } else {
        this.release({ holder: event.holder });
      }
    });
    this.registerCleanup(() => this.stopGuard?.());
  }

  get locked(): boolean {
    return this.state.holds.length > 0;
  }

  /** True when the owner can leave. When a request is in flight, the notice says why not. */
  canLeave(): boolean {
    if (!this.locked) {
      return true;
    }
    this.refuse();
    return false;
  }

  private hold({ holder, reason }: Hold): void {
    const others = this.state.holds.filter((hold) => hold.holder !== holder);
    this.setState({ holds: [...others, { holder, reason }] });
    this.stopGuard ??= this.deps.services.history.guard(() => this.refuse());
  }

  private release({ holder }: { holder: string }): void {
    const holds = this.state.holds.filter((hold) => hold.holder !== holder);
    if (holds.length === this.state.holds.length) {
      return;
    }
    if (holds.length === 0) {
      this.stopGuard?.();
      this.stopGuard = null;
      this.setState({ holds, notice: null });
      return;
    }
    this.setState({ holds });
  }

  private refuse(): void {
    const newest = this.state.holds.at(-1);
    if (newest) {
      const notice: Notice = { kind: "info", text: MESSAGES[newest.reason] };
      this.setState({ notice });
      this.plugins.pageNotice.show({ notice });
    }
  }
}
