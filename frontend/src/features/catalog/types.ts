/** Where a notice about a catalog change shows: the log or the Setup page. */
export type NoticeTarget = "log" | "settings";

import type {
  Activity,
  ActivityGroup,
  Goal,
} from "@app/common/features/catalog/types";

/**
 * `catalogChanged`: the catalog changed, so the pages that show it read it
 * again. `catalogRead`: the log read the catalog, so Setup can show it before
 * its own read ends, as the old site showed the catalog that it had.
 */
export type CatalogEvent =
  | {
      type: "catalogChanged";
      /** A message for the page that the owner returns to. */
      notice?: { target: NoticeTarget; text: string };
    }
  | {
      type: "catalogRead";
      catalog: {
        groups: ActivityGroup[];
        activities: Activity[];
        goals: Goal[];
      };
    };
