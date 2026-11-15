import { Logic } from "@app/common/features/core/logic/logic";
import type { Notice } from "../../days/types.js";
import type { FrontendLogicProps } from "../logic/types.js";
import type { App, PageView } from "../types.js";

type PageNoticeLogicProps = FrontendLogicProps & Pick<App, "pageNoticeEvents">;

interface PageNoticeLogicState {
  /** The page that is open, or `null` for an address with no page. */
  view: PageView | null;
  /** The newest message of the open page. */
  notice: Notice | null;
  /** The page that the notice is for. */
  noticeView: PageView | null;
}

/**
 * The one message slot of the pages. It keeps the newest message that a page
 * sent. Opening another page empties it, unless the message is for that page,
 * as "Activity added." is for Setup.
 */
export class PageNoticeLogic extends Logic<
  PageNoticeLogicProps,
  PageNoticeLogicState
> {
  constructor(deps: PageNoticeLogicProps) {
    super({
      deps,
      initialState: { view: null, notice: null, noticeView: null },
    });
  }

  protected override async onInitialize(): Promise<void> {
    this.listen(this.deps.pageNoticeEvents, (event) => {
      if (event.type === "shown") {
        this.setState({
          notice: event.notice,
          noticeView: event.view ?? this.state.view,
        });
      } else {
        this.setState({ notice: null, noticeView: null });
      }
    });
  }

  /** Tell the slot which page is open. */
  openView({ view }: { view: PageView | null }): void {
    if (view === this.state.view) {
      return;
    }
    this.setState({
      view,
      ...(this.state.noticeView === view
        ? {}
        : { notice: null, noticeView: null }),
    });
  }
}
