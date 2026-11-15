import { LogicPlugin } from "@app/common/features/core/logic/logic-plugin";
import type { TaskState } from "@app/common/features/core/logic/logic";
import type {
  Activity,
  ActivityGroup,
  Goal,
  Mood,
} from "@app/common/features/catalog/types";
import { requireApiSuccess } from "../../api/client/api-client.js";
import type { FrontendLogicProps } from "../../core/logic/types.js";
import type { App } from "../../core/types.js";

export type CatalogReadProps = FrontendLogicProps<never, never, "catalog"> &
  Pick<App, "catalogEvents">;

interface CatalogReadState {
  moods: Mood[];
  groups: ActivityGroup[];
  activities: Activity[];
  goals: Goal[];
  /** True after the first read. A failed read later does not reset it. */
  catalogLoaded: boolean;
  loadCatalogState: TaskState;
  loadCatalogError: string | null;
}

/** The moods, groups, activities and goals that the log shows. */
export class CatalogReadPlugin extends LogicPlugin<
  CatalogReadProps,
  CatalogReadState
> {
  constructor(deps: CatalogReadProps) {
    super({
      deps,
      initialState: {
        moods: [],
        groups: [],
        activities: [],
        goals: [],
        catalogLoaded: false,
        loadCatalogState: "pristine",
        loadCatalogError: null,
      },
    });
  }

  /** True when the catalog is loaded. */
  async load(): Promise<boolean> {
    await this.executeTask("loadCatalog", async () => {
      const response = await this.deps.api.catalog.$get(undefined, {
        init: { signal: this.signal },
      });
      await requireApiSuccess(response);
      if (response.status !== 200) {
        throw new Error("Could not connect to your journal.");
      }
      const catalog = await response.json();
      this.setState({ ...catalog, catalogLoaded: true });
      this.deps.catalogEvents.emitDetached({
        type: "catalogRead",
        catalog: {
          groups: catalog.groups,
          activities: catalog.activities,
          goals: catalog.goals,
        },
      });
    });
    return this.state.loadCatalogState === "success";
  }

  knownActivityIds(): Set<string> {
    return new Set(this.state.activities.map((activity) => activity.id));
  }

  knownGoalIds(): Set<string> {
    return new Set(this.state.goals.map((goal) => goal.id));
  }
}
