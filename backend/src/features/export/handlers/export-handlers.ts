import { Hono } from "hono";
import type { BackendLogic } from "../../core/types.js";

interface ExportHandlerProps {
  logic: Pick<
    BackendLogic,
    "catalog" | "days" | "exports" | "imports" | "settings"
  >;
}

/** The route of `GET /api/export`: everything that the owner saved, as one JSON file. */
export function createExportHandlers({ logic }: ExportHandlerProps) {
  return new Hono().get("/", async () => {
    const [catalog, days, importRuns, appSettings] = await Promise.all([
      logic.catalog.exportRows(),
      logic.days.exportRows(),
      logic.imports.exportRows(),
      logic.settings.exportRows(),
    ]);
    const file = logic.exports.buildFile({
      tables: { ...catalog, ...days, importRuns, appSettings },
    });
    return new Response(JSON.stringify(file, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition":
          'attachment; filename="daylio-clone-export.json"',
        "cache-control": "no-store",
      },
    });
  });
}
