import { Logic, type TaskState } from "@app/common/features/core/logic/logic";
import type { ActivityGroup } from "@app/common/features/catalog/types";
import type { FrontendLogicProps } from "../../core/logic/types.js";
import { failureMessage } from "../../core/logic/failure-message.js";
import type { App } from "../../core/types.js";
import type { Notice } from "../../days/types.js";
import type { NoticeTarget } from "../types.js";
import { resolveActiveGroupId } from "../utils/active-group.js";
import { CatalogRequestsPlugin } from "./catalog-requests-plugin.js";

type AddActivityProps = FrontendLogicProps<never, "device", "catalog"> &
  Pick<App, "catalogEvents"> & {
    /** The group from the address, if it names one. */
    requestedGroupId: string | undefined;
    /** The page that opened the form, and that shows the notice after the add. */
    returnTo: NoticeTarget;
  };

const DEFAULT_ICON = "category";

interface AddActivityState {
  groups: ActivityGroup[];
  name: string;
  /** The group that the owner picked. Empty until the owner picks one. */
  pickedGroupId: string;
  icon: string;
  iconPickerOpen: boolean;
  adding: boolean;
  notice: Notice | null;
  loadGroupsState: TaskState;
  loadGroupsError: string | null;
}

/** The form that adds one activity to a group. */
export class AddActivityLogic extends Logic<
  AddActivityProps,
  AddActivityState,
  never,
  { requests: CatalogRequestsPlugin }
> {
  constructor(deps: AddActivityProps) {
    super({
      deps,
      plugins: {
        requests: (pluginDeps) => new CatalogRequestsPlugin(pluginDeps),
      },
      initialState: {
        groups: [],
        name: "",
        pickedGroupId: "",
        icon: DEFAULT_ICON,
        iconPickerOpen: false,
        adding: false,
        notice: null,
        loadGroupsState: "pristine",
        loadGroupsError: null,
      },
    });
  }

  protected override async onInitialize(): Promise<void> {
    await this.executeTask("loadGroups", async () => {
      const catalog = await this.plugins.requests.read();
      this.setState({ groups: catalog.groups });
    });
  }

  /** The group that the form adds to. */
  get groupId(): string {
    return resolveActiveGroupId({
      groups: this.state.groups,
      requestedId: this.state.pickedGroupId || this.deps.requestedGroupId,
    });
  }

  setName({ name }: { name: string }): void {
    this.setState({ name });
  }

  chooseGroup({ groupId }: { groupId: string }): void {
    this.setState({ pickedGroupId: groupId });
  }

  openIconPicker(): void {
    this.setState({ iconPickerOpen: true });
  }

  closeIconPicker(): void {
    this.setState({ iconPickerOpen: false });
  }

  chooseIcon({ icon }: { icon: string }): void {
    this.setState({ icon, iconPickerOpen: false });
  }

  /** True when the owner can leave. The form waits while the activity is added. */
  canLeave(): boolean {
    if (!this.state.adding) {
      return true;
    }
    this.setState({
      notice: {
        kind: "info",
        text: "Wait for the activity update to finish before leaving this view.",
      },
    });
    return false;
  }

  /** True when the activity is added. */
  async add(): Promise<boolean> {
    const { groupId } = this;
    const name = this.state.name.trim();
    if (this.state.adding) {
      return false;
    }
    if (!name) {
      this.setState({
        notice: { kind: "error", text: "Activity name is required." },
      });
      return false;
    }
    if (!groupId) {
      this.setState({
        notice: {
          kind: "error",
          text: "Create an active activity group before adding an activity.",
        },
      });
      return false;
    }
    if (!this.deps.services.device.isOnline()) {
      this.setState({
        notice: {
          kind: "error",
          text: "You’re offline. Reconnect before adding an activity.",
        },
      });
      return false;
    }
    this.setState({
      adding: true,
      notice: { kind: "info", text: "Adding activity…" },
    });
    try {
      await this.plugins.requests.createActivity({
        name,
        groupId,
        icon: this.state.icon,
      });
    } catch (error) {
      this.setState({
        adding: false,
        notice: { kind: "error", text: failureMessage(error) },
      });
      return false;
    }
    this.setState({ adding: false, notice: null });
    this.deps.catalogEvents.emitDetached({
      type: "catalogChanged",
      notice: { target: this.deps.returnTo, text: "Activity added." },
    });
    return true;
  }
}
