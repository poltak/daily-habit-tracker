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

export type CatalogReadProps = FrontendLogicProps<never, never, "catalog">;

interface CatalogReadState {
  moods: Mood[];
  groups: ActivityGroup[];
  activities: Activity[];
  goals: Goal[];
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
      this.setState(await response.json());
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
