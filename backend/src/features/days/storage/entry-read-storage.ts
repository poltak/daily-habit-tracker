import { sql, type RawBuilder } from "kysely";
import type { Database } from "../../core/database/database.js";
import type {
  ActivityLink,
  ActivitySelectionRow,
  CompletionRow,
  EntryListRow,
} from "./types.js";

export interface EntryPageRows {
  entries: EntryListRow[];
  links: ActivityLink[];
  selections: ActivitySelectionRow[];
  completions: CompletionRow[];
}

/**
 * The entries of `page`, a CTE named `page` that selects whole `entries`
 * rows, and the rows that belong to them. Each query holds the page in the
 * CTE, so that it binds a few values and reads only the rows of the page.
 */
export async function readEntriesOfPage({
  db,
  page,
  newestFirst,
}: {
  db: Database;
  page: RawBuilder<unknown>;
  newestFirst: boolean;
}): Promise<EntryPageRows> {
  const direction = sql.raw(newestFirst ? "desc" : "asc");
  const [entries, links, selections, completions] = await Promise.all([
    sql<EntryListRow>`${page}
      select page.*, coalesce(selection.mood_id, page.mood_id) as effective_mood_id
      from page left join day_mood_selections as selection
        on selection.logical_date = page.logical_date
      order by page.logical_date ${direction}`.execute(db),
    sql<ActivityLink>`${page}
      select link.entry_id, link.activity_id
      from page join entry_activities as link on link.entry_id = page.id
      order by link.activity_id`.execute(db),
    sql<ActivitySelectionRow>`${page}
      select selection.logical_date, selection.activity_id, selection.selected
      from page join day_activity_selections as selection
        on selection.logical_date = page.logical_date
      order by selection.activity_id`.execute(db),
    // The page stays on the outer side of the lookup by date.
    sql<CompletionRow>`${page}
      select completion.logical_date, completion.goal_id
      from page cross join goal_completions as completion
        on completion.logical_date = page.logical_date
      order by completion.goal_id`.execute(db),
  ]);
  return {
    entries: entries.rows,
    links: links.rows,
    selections: selections.rows,
    completions: completions.rows,
  };
}
