import { Logic, type TaskState } from "@app/common/features/core/logic/logic";
import { requireApiSuccess } from "../../api/client/api-client.js";
import type { FrontendLogicProps } from "../../core/logic/types.js";
import type { App } from "../../core/types.js";
import { LeaveLockPlugin } from "../../core/ui/leave-lock-plugin.js";
import { PageNoticePlugin } from "../../core/ui/page-notice-plugin.js";

type ExportProps = FrontendLogicProps<never, "downloads", "export"> &
  Pick<App, "navigationLockEvents" | "pageNoticeEvents">;

interface ExportState {
  exportState: TaskState;
  exportError: string | null;
  /** True after a download, until the next one starts. */
  downloaded: boolean;
}

const FILENAME = "daylio-clone-export.json";

/** The download of everything the owner saved, as one JSON file. */
export class ExportLogic extends Logic<
  ExportProps,
  ExportState,
  never,
  { leaveLock: LeaveLockPlugin; pageNotice: PageNoticePlugin }
> {
  constructor(deps: ExportProps) {
    super({
      deps,
      plugins: {
        leaveLock: (pluginDeps) =>
          new LeaveLockPlugin({
            navigationLockEvents: pluginDeps.navigationLockEvents,
            reason: "setup",
          }),
        pageNotice: (pluginDeps) =>
          new PageNoticePlugin({
            pageNoticeEvents: pluginDeps.pageNoticeEvents,
          }),
      },
      initialState: {
        exportState: "pristine",
        exportError: null,
        downloaded: false,
      },
    });
  }

  protected override async onInitialize(): Promise<void> {
    this.registerCleanup(
      this.subscribe(() =>
        this.plugins.leaveLock.update({
          busy: this.state.exportState === "running",
        }),
      ),
    );
  }

  async download(): Promise<void> {
    this.setState({ downloaded: false });
    await this.executeTask("export", async () => {
      const response = await this.deps.api.export.$get(undefined, {
        init: { signal: this.signal },
      });
      await requireApiSuccess(response);
      this.deps.services.downloads.save({
        filename: FILENAME,
        content: await response.blob(),
      });
    });
    this.setState({ downloaded: this.state.exportState === "success" });
    if (this.state.downloaded) {
      this.plugins.pageNotice.show({
        notice: { kind: "success", text: "Export downloaded." },
      });
    } else if (this.state.exportError) {
      this.plugins.pageNotice.show({
        notice: { kind: "error", text: this.state.exportError },
      });
    }
  }
}
