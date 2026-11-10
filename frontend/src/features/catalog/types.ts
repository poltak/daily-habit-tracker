/** Where a notice about a catalog change shows: the log or the Setup page. */
export type NoticeTarget = "log" | "settings";

/** The catalog changed, so the pages that show it read it again. */
export interface CatalogEvent {
  type: "catalogChanged";
  /** A message for the page that the owner returns to. */
  notice?: { target: NoticeTarget; text: string };
}
