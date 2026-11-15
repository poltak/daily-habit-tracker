import { Logic, type TaskState } from "@app/common/features/core/logic/logic";
import {
  encodeApiParam,
  requireApiSuccess,
} from "../../api/client/api-client.js";
import type { FrontendLogicProps } from "../../core/logic/types.js";
import type { App } from "../../core/types.js";
import { LeaveLockPlugin } from "../../core/ui/leave-lock-plugin.js";
import { PageNoticePlugin } from "../../core/ui/page-notice-plugin.js";

type ConnectionsProps = FrontendLogicProps<never, "dialogs", "auth"> &
  Pick<App, "navigationLockEvents" | "pageNoticeEvents">;

interface Connection {
  id: string;
  name: string;
  createdAt: number;
  lastUsedAt: number | null;
}

interface ConnectionNotice {
  kind: "success" | "error";
  text: string;
}

interface ConnectionsState {
  connections: Connection[];
  loadConnectionsState: TaskState;
  loadConnectionsError: string | null;
  removeConnectionState: TaskState;
  removeConnectionError: string | null;
  /** The result of the latest disconnect, for the owner. */
  notice: ConnectionNotice | null;
}

/** The apps that the owner connected to the MCP endpoint, such as ChatGPT: list, and disconnect. */
export class ConnectionsLogic extends Logic<
  ConnectionsProps,
  ConnectionsState,
  never,
  { leaveLock: LeaveLockPlugin; pageNotice: PageNoticePlugin }
> {
  constructor(deps: ConnectionsProps) {
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
        connections: [],
        loadConnectionsState: "pristine",
        loadConnectionsError: null,
        removeConnectionState: "pristine",
        removeConnectionError: null,
        notice: null,
      },
    });
  }

  protected override async onInitialize(): Promise<void> {
    this.registerCleanup(
      this.subscribe(() => {
        this.plugins.leaveLock.update({
          busy: this.state.removeConnectionState === "running",
        });
        this.plugins.pageNotice.follow({ notice: this.state.notice });
      }),
    );
    await this.loadConnections();
  }

  async loadConnections(): Promise<void> {
    await this.executeTask("loadConnections", () => this.readConnections());
    if (this.state.loadConnectionsError) {
      this.plugins.pageNotice.show({
        notice: { kind: "error", text: this.state.loadConnectionsError },
      });
    }
  }

  /** Ask first. A no leaves the app connected. The app stops working at once after a yes. */
  async removeConnection({ id }: { id: string }): Promise<void> {
    const target = this.state.connections.find(
      (candidate) => candidate.id === id,
    );
    if (
      target &&
      !this.deps.services.dialogs.confirm(
        `Disconnect ${target.name}? It stops working until you connect it again.`,
      )
    ) {
      return;
    }
    this.setState({ notice: null });
    await this.executeTask("removeConnection", async () => {
      const response = await this.deps.api.auth.connections[":id"].$delete(
        { param: { id: encodeApiParam(id) } },
        { init: { signal: this.signal } },
      );
      await requireApiSuccess(response);
      await this.readConnections();
    });
    if (this.state.removeConnectionState === "success") {
      this.setState({
        notice: {
          kind: "success",
          text: `${target?.name ?? "The app"} disconnected.`,
        },
      });
    } else if (this.state.removeConnectionState === "error") {
      this.setState({
        notice: { kind: "error", text: this.state.removeConnectionError ?? "" },
      });
    }
  }

  private async readConnections(): Promise<void> {
    const response = await this.deps.api.auth.connections.$get(undefined, {
      init: { signal: this.signal },
    });
    await requireApiSuccess(response);
    if (response.status !== 200) {
      throw new Error("Unexpected connections response");
    }
    this.setState({ connections: (await response.json()).connections });
  }
}
