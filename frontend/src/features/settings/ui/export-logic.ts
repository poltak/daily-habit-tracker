import { Logic, type TaskState } from "@app/common/features/core/logic/logic";
import { requireApiSuccess } from "../../api/client/api-client.js";
import type { FrontendLogicProps } from "../../core/logic/types.js";

type ExportProps = FrontendLogicProps<never, "downloads", "export">;

interface ExportState {
  exportState: TaskState;
  exportError: string | null;
  /** True after a download, until the next one starts. */
  downloaded: boolean;
}

const FILENAME = "daylio-clone-export.json";

/** The download of everything the owner saved, as one JSON file. */
export class ExportLogic extends Logic<ExportProps, ExportState> {
  constructor(deps: ExportProps) {
    super({
      deps,
      initialState: {
        exportState: "pristine",
        exportError: null,
        downloaded: false,
      },
    });
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
  }
}
