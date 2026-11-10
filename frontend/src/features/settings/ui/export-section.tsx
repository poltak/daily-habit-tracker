import { useMemo } from "react";
import { useLogic } from "../../core/logic/use-logic.js";
import { useFrontendApp } from "../../core/ui/frontend-app-context.js";
import { MaterialIcon } from "../../core/ui/material-icon.js";
import { ExportLogic } from "./export-logic.js";

/** The button that downloads a copy of the journal. */
export function ExportSection() {
  const app = useFrontendApp();
  const deps = useMemo(
    () => ({
      storage: {},
      services: { downloads: app.services.downloads },
      api: { export: app.api.export },
    }),
    [app],
  );
  const { logic, state } = useLogic({ LogicClass: ExportLogic, deps });
  const busy = state.exportState === "running";
  const notice =
    state.exportError ?? (state.downloaded ? "Export downloaded." : null);
  return (
    <section className="settings-card export-card">
      {notice && (
        <output
          className={`settings-notice ${state.exportError ? "error" : "success"}`}
        >
          {notice}
        </output>
      )}
      <div>
        <p className="eyebrow">Portability</p>
        <h2>Keep a copy of your data</h2>
        <p className="muted">
          Download a versioned JSON export whenever you want.
        </p>
      </div>
      <button
        type="button"
        className="secondary-button"
        aria-busy={busy}
        disabled={busy}
        onClick={() => void logic.download()}
      >
        {busy ? (
          <span className="spinner" aria-hidden="true" />
        ) : (
          <MaterialIcon name="download" />
        )}{" "}
        {busy ? "Exporting…" : "Export JSON"}
      </button>
    </section>
  );
}
