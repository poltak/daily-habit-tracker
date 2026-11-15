import { useLogicInstance } from "../../core/logic/use-logic.js";
import { useJournal } from "./journal-context.js";

/**
 * The message when the catalog could not be read, with a button that reads it
 * again. A page that has the catalog already keeps showing it above this.
 */
export function CatalogReloadNotice() {
  const { logic } = useJournal();
  const catalog = useLogicInstance(logic.plugins.catalog);
  if (catalog.loadCatalogState !== "error") {
    return null;
  }
  return (
    <div className="notice error" role="alert">
      <p>{catalog.loadCatalogError}</p>
      <button
        type="button"
        className="loading-retry"
        onClick={() => void logic.loadJournal()}
      >
        Retry
      </button>
    </div>
  );
}
